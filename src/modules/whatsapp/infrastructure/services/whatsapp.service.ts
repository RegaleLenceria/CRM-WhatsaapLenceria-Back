// src/modules/whatsapp/infrastructure/services/whatsapp.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import makeWASocket, { downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';
import { Repository, Not, IsNull, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Device } from '../entities/device.entity';
import { Message } from '../entities/message.entity';
import { Customer } from '../../../customers/infrastructure/entities/customer.entity';
import { Setting } from '../entities/setting.entity';
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
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    try {
      // Purge any corrupted LID, newsletter, or group chats from the customers table
      console.log('Purging invalid/encrypted contacts from the database...');
      await this.customerRepository.query(`
        DELETE FROM customers 
        WHERE phone NOT SIMILAR TO '[0-9]+'
           OR LENGTH(phone) > 15
      `);
      console.log('Database cleanup completed.');

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

    sock.ev.on('message-receipt.update', (receipts) => {
      void (async () => {
        for (const r of receipts) {
          const whatsappMessageId = r.key.id;
          if (!whatsappMessageId) continue;

          const message = await this.messageRepository.findOne({
            where: { whatsappMessageId },
            relations: { customer: true },
          });

          if (message && message.type === 'outgoing') {
            // Check if readTimestamp exists in receipt update payload
            const isReadUpdate = r.receipt && 
              (r.receipt.readTimestamp !== undefined && r.receipt.readTimestamp !== null);

            if (isReadUpdate) {
              message.isRead = true;
              message.receipt = 'read';
            } else if (message.receipt !== 'read') {
              message.receipt = 'delivered';
            }
            await this.messageRepository.save(message);

            this.eventEmitter.emit('whatsapp.message.receipt', {
              messageId: message.id,
              whatsappMessageId,
              chatId: message.customer?.id,
              receipt: message.receipt,
              isRead: message.isRead,
            });
          }
        }
      })();
    });

    sock.ev.on('messaging-history.set', (data) => {
      void (async () => {
        try {
          const { messages, contacts } = data;
          
          if (contacts && contacts.length > 0) {
            console.log(`Received initial WhatsApp contacts: ${contacts.length}`);
            const contactsMap = new Map<string, string>();
            for (const contact of contacts) {
              const phone = contact.id.split('@')[0].split(':')[0];
              if (phone && contact.id.endsWith('@s.whatsapp.net')) {
                const name = contact.name || contact.notify || contact.verifiedName;
                if (name) {
                  contactsMap.set(phone, name);
                }
              }
            }
            const validContacts = Array.from(contactsMap.entries()).map(([phone, name]) => ({ phone, name }));
            
            if (validContacts.length > 0) {
              const chunkSize = 500;
              for (let i = 0; i < validContacts.length; i += chunkSize) {
                await this.customerRepository.upsert(validContacts.slice(i, i + chunkSize), ['phone']);
              }
            }
          }

          console.log(`Received initial WhatsApp history: ${messages?.length || 0} messages`);
          if (messages && messages.length > 0) {
             const allCustomers = await this.customerRepository.find({ select: { id: true, phone: true, name: true } });
             const customerMap = new Map(allCustomers.map(c => [c.phone, c]));
             const messagesToInsert: Partial<Message>[] = [];

             for (const msg of messages) {
               if (!msg.key.remoteJid || !msg.key.remoteJid.endsWith('@s.whatsapp.net')) continue;
               const whatsappMessageId = msg.key.id;
               if (!whatsappMessageId) continue;
               
               const phone = msg.key.remoteJid.split('@')[0].split(':')[0];
               if (phone === 'status' || msg.key.remoteJid === 'status@broadcast') continue;
               
               let content = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
               
               if (msg.message?.imageMessage) {
                 content = content ? `[image] ${content}` : `[image]`;
               }
               if (!content) continue;

               let customer = customerMap.get(phone);
               if (!customer) {
                 customer = this.customerRepository.create({ phone, name: msg.pushName || `Cliente ${phone}` });
                 customer = await this.customerRepository.save(customer);
                 customerMap.set(phone, customer);
               } else if (msg.pushName && (customer.name.startsWith('Cliente ') || customer.name === `Cliente ${phone}`)) {
                 customer.name = msg.pushName;
                 this.customerRepository.save(customer).catch(() => {});
               }

               const type = msg.key.fromMe ? 'outgoing' : 'incoming';
               const status = msg.key.fromMe ? 'en_atencion' : 'pendiente';

               messagesToInsert.push({
                 whatsappMessageId,
                 type,
                 content,
                 status,
                 isRead: msg.key.fromMe ? true : false,
                 timestamp: msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date(),
                 device: { id: deviceId },
                 customer: { id: customer.id }
               } as any);
             }

             if (messagesToInsert.length > 0) {
               // Find existing messages to avoid duplicates since we can't upsert without unique constraint
               const chunkSize = 500;
               const existingIds = new Set<string>();
               
               for (let i = 0; i < messagesToInsert.length; i += chunkSize) {
                 const chunk = messagesToInsert.slice(i, i + chunkSize);
                 const existingMessages = await this.messageRepository.find({
                   where: { whatsappMessageId: In(chunk.map(m => m.whatsappMessageId as string)) },
                   select: { whatsappMessageId: true }
                 });
                 existingMessages.forEach(m => existingIds.add(m.whatsappMessageId));
               }

               const newMessages = messagesToInsert.filter(m => !existingIds.has(m.whatsappMessageId as string));

               for (let i = 0; i < newMessages.length; i += chunkSize) {
                 const chunk = newMessages.slice(i, i + chunkSize);
                 await this.messageRepository
                   .createQueryBuilder()
                   .insert()
                   .into(Message)
                   .values(chunk)
                   .execute();
               }
             }
          }
          
          console.log(`Finished processing WhatsApp history for device ${deviceId}`);
          // Force reload in frontend once history sync completes
          this.eventEmitter.emit('whatsapp.connection.connected', {
            deviceId,
          });
        } catch (error) {
          console.error(`Error processing WhatsApp history for device ${deviceId}:`, error);
          // Emit connected anyway so the frontend doesn't hang forever
          this.eventEmitter.emit('whatsapp.connection.connected', {
            deviceId,
          });
        }
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
      if (mediaUrl.startsWith('data:')) {
        const mimeType = mediaUrl.split(';')[0].split(':')[1];
        const base64Data = mediaUrl.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        return await sock.sendMessage(jid, {
          image: buffer,
          caption: text || '',
          mimetype: mimeType,
        });
      } else {
        return await sock.sendMessage(jid, {
          image: { url: mediaUrl },
          caption: text || '',
        });
      }
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
      if (!msg.key.remoteJid || !msg.key.remoteJid.endsWith('@s.whatsapp.net')) {
        return;
      }

      const whatsappMessageId = msg.key.id;
      if (!whatsappMessageId) {
        return;
      }

      const phone = msg.key.remoteJid.split('@')[0].split(':')[0];
      if (phone === 'status' || msg.key.remoteJid === 'status@broadcast') {
        return;
      }

      const sock = this.sessions.get(deviceId);
      let content =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      if (msg.message?.imageMessage && sock) {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            {
              logger: console as any,
              reuploadRequest: sock.updateMediaMessage,
            },
          );
          if (buffer) {
            const base64 = buffer.toString('base64');
            const caption = msg.message.imageMessage.caption || '';
            content = `[image:data:image/jpeg;base64,${base64}]${caption}`;
          }
        } catch (err) {
          console.error('Error downloading incoming WhatsApp image:', err);
        }
      }

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
      } else if (msg.pushName && (customer.name.startsWith('Cliente ') || customer.name === `Cliente ${phone}`)) {
        customer.name = msg.pushName;
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

      const fullMessage = await this.messageRepository.findOne({
        where: { id: savedMessage.id },
        relations: { customer: true, device: true },
      });

      if (fullMessage) {
        this.eventEmitter.emit('whatsapp.message.new', fullMessage);

        if (this.onMessageReceived) {
          this.onMessageReceived(fullMessage);
        }
      }
    } catch (error) {
      console.error(
        `Error processing WhatsApp message for device ${deviceId}:`,
        error,
      );
    }
  }

  async getSetting(key: string): Promise<Setting | null> {
    return this.settingRepository.findOne({ where: { key } });
  }

  async saveSetting(key: string, value: string): Promise<Setting> {
    let setting = await this.settingRepository.findOne({ where: { key } });
    if (setting) {
      setting.value = value;
    } else {
      setting = this.settingRepository.create({ key, value });
    }
    return this.settingRepository.save(setting);
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
