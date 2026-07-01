// src/modules/whatsapp/infrastructure/services/whatsapp.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import makeWASocket from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { Repository, Not, IsNull } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Device } from '../entities/device.entity';
import { Message } from '../entities/message.entity';
import { Customer } from '../../../customers/infrastructure/entities/customer.entity';
import { usePostgresAuthState } from '../adapters/postgres-auth-state.adapter';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private sessions = new Map<string, any>();

  // Callback to emit QR code updates through the WebSockets gateway
  public onQrReceived?: (deviceId: string, qr: string) => void;

  // Callback to emit new messages through the WebSockets gateway
  public onMessageReceived?: (message: Message) => void;

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    try {
      // Find all devices with saved session credentials
      const savedDevices = await this.deviceRepository.find({
        where: {
          sessionTokens: Not(IsNull()),
        },
      });

      for (const device of savedDevices) {
        console.log(
          `Auto-reconnecting WhatsApp session for device ${device.id}...`,
        );
        this.startConnection(device.id).catch((err) => {
          console.error(
            `Failed to auto-reconnect WhatsApp session for device ${device.id}:`,
            err,
          );
        });
      }
    } catch (err) {
      console.error(
        'Error during auto-reconnection of WhatsApp sessions:',
        err,
      );
    }
  }

  async startConnection(deviceId: string): Promise<void> {
    if (this.sessions.has(deviceId)) {
      return;
    }

    const { state, saveCreds } = await usePostgresAuthState(
      deviceId,
      this.deviceRepository,
    );

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
    });

    this.sessions.set(deviceId, sock);

    sock.ev.on('creds.update', () => {
      void saveCreds();
    });

    sock.ev.on('messages.upsert', (m) => {
      void (async () => {
        if (m.type !== 'notify') {
          return;
        }

        for (const msg of m.messages) {
          await this.processMessage(msg, deviceId);
        }
      })();
    });

    sock.ev.on('messaging-history.set', (data) => {
      void (async () => {
        const { messages } = data;
        console.log(`Received initial WhatsApp history: ${messages?.length} messages`);
        if (messages) {
          for (const msg of messages) {
            await this.processMessage(msg, deviceId);
          }
        }
        // Force reload in frontend once history sync completes
        this.eventEmitter.emit('whatsapp.connection.connected', {
          deviceId,
        });
      })();
    });

    sock.ev.on('connection.update', (update) => {
      void (async () => {
        const { connection, lastDisconnect, qr } = update;

        if (qr && this.onQrReceived) {
          this.onQrReceived(deviceId, qr);
        }

        if (connection === 'open') {
          console.log(
            `WhatsApp connection opened successfully for device ${deviceId}`,
          );
          await this.deviceRepository.update(deviceId, { isOnline: true });
          this.eventEmitter.emit('whatsapp.connection.connected', {
            deviceId,
          });
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output
            ?.statusCode;
          // 401 corresponds to DisconnectReason.loggedOut
          const shouldReconnect = statusCode !== 401;

          this.sessions.delete(deviceId);
          await this.deviceRepository.update(deviceId, { isOnline: false });

          if (shouldReconnect) {
            console.log(
              `WhatsApp connection closed for device ${deviceId} (status code: ${statusCode}). Attempting to reconnect...`,
            );
            this.startConnection(deviceId).catch((err) => {
              console.error(`Error reconnecting device ${deviceId}:`, err);
            });
          } else {
            console.log(
              `WhatsApp connection closed permanently for device ${deviceId} (Logged Out). Cleaning credentials...`,
            );
            await this.deviceRepository.update(deviceId, {
              sessionTokens: null as unknown,
            } as unknown as Device);
            this.eventEmitter.emit('whatsapp.connection.logged_out', {
              deviceId,
            });
          }
        }
      })();
    });
  }

  async sendMessage(
    deviceId: string,
    phone: string,
    text: string,
    mediaUrl?: string,
  ): Promise<any> {
    const sock = this.sessions.get(deviceId) as
      ReturnType<typeof makeWASocket> | undefined;
    if (!sock) {
      throw new Error(
        `WhatsApp session for device ${deviceId} is not active or connected.`,
      );
    }

    const jid = phone.includes('@s.whatsapp.net')
      ? phone
      : `${phone}@s.whatsapp.net`;

    if (mediaUrl) {
      return await sock.sendMessage(jid, {
        image: { url: mediaUrl },
        caption: text,
      });
    } else {
      return await sock.sendMessage(jid, { text });
    }
  }

  async getDevices(): Promise<Device[]> {
    return this.deviceRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createDevice(id: string, name: string, phoneNumber: string): Promise<Device> {
    const device = this.deviceRepository.create({
      id,
      name,
      phoneNumber,
      isOnline: false,
    });
    return this.deviceRepository.save(device);
  }

  private async processMessage(msg: any, deviceId: string) {
    try {
      if (!msg.key.remoteJid || msg.key.remoteJid.endsWith('@g.us')) {
        return;
      }

      const whatsappMessageId = msg.key.id;
      if (!whatsappMessageId) {
        return;
      }

      const phone = msg.key.remoteJid.split('@')[0];
      if (phone === 'status' || msg.key.remoteJid === 'status@broadcast') {
        return;
      }

      const content =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      if (!content) {
        return;
      }

      const existingMessage = await this.messageRepository.findOne({
        where: { whatsappMessageId },
      });
      if (existingMessage) {
        return;
      }

      let customer = await this.customerRepository.findOne({
        where: { phone },
      });
      if (!customer) {
        customer = this.customerRepository.create({
          phone,
          name: msg.pushName || `Cliente ${phone}`,
        });
        customer = await this.customerRepository.save(customer);
      }

      const type = msg.key.fromMe ? 'outgoing' : 'incoming';
      const status = msg.key.fromMe ? 'en_atencion' : 'pendiente';

      const newMessage = this.messageRepository.create({
        whatsappMessageId,
        type,
        content,
        status,
        isRead: msg.key.fromMe ? true : false,
        timestamp: msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000)
          : new Date(),
        device: { id: deviceId },
        customer,
      });

      const savedMessage = await this.messageRepository.save(newMessage);

      this.eventEmitter.emit('whatsapp.message.new', savedMessage);

      if (this.onMessageReceived) {
        this.onMessageReceived(savedMessage);
      }
    } catch (error) {
      console.error(
        `Error processing WhatsApp message for device ${deviceId}:`,
        error,
      );
    }
  }

  onModuleDestroy() {
    for (const [deviceId, sock] of this.sessions.entries()) {
      try {
        sock.end(undefined);
      } catch (err) {
        console.error(`Error ending session for device ${deviceId}:`, err);
      }
    }
    this.sessions.clear();
  }
}
