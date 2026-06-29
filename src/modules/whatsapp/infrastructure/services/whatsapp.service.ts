// src/modules/whatsapp/infrastructure/services/whatsapp.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';
import { Repository, Not, IsNull } from 'typeorm';
import { Device } from '../entities/device.entity';
import { usePostgresAuthState } from '../adapters/postgres-auth-state.adapter';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private sessions = new Map<string, any>();

  // Callback to emit QR code updates through the WebSockets gateway
  public onQrReceived?: (deviceId: string, qr: string) => void;

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
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
        console.log(`Auto-reconnecting WhatsApp session for device ${device.id}...`);
        this.startConnection(device.id).catch((err) => {
          console.error(`Failed to auto-reconnect WhatsApp session for device ${device.id}:`, err);
        });
      }
    } catch (err) {
      console.error('Error during auto-reconnection of WhatsApp sessions:', err);
    }
  }

  async startConnection(deviceId: string): Promise<void> {
    if (this.sessions.has(deviceId)) {
      return;
    }

    const { state, saveCreds } = await usePostgresAuthState(deviceId, this.deviceRepository);

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }) as any,
    });

    this.sessions.set(deviceId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.onQrReceived) {
        this.onQrReceived(deviceId, qr);
      }

      if (connection === 'open') {
        console.log(`WhatsApp connection opened successfully for device ${deviceId}`);
        await this.deviceRepository.update(deviceId, { isOnline: true });
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`WhatsApp connection closed for device ${deviceId}. Reconnecting: ${shouldReconnect}`);
        this.sessions.delete(deviceId);
        await this.deviceRepository.update(deviceId, { isOnline: false });

        if (shouldReconnect) {
          this.startConnection(deviceId).catch((err) => {
            console.error(`Error reconnecting device ${deviceId}:`, err);
          });
        }
      }
    });
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
