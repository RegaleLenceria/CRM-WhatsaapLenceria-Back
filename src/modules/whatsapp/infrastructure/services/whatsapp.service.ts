// src/modules/whatsapp/infrastructure/services/whatsapp.service.ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import pino from 'pino';

@Injectable()
export class WhatsappService implements OnModuleDestroy {
  private sessions = new Map<string, any>();

  // Callback to emit QR code updates through the WebSockets gateway
  public onQrReceived?: (deviceId: string, qr: string) => void;

  async startConnection(deviceId: string): Promise<void> {
    if (this.sessions.has(deviceId)) {
      return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(`sessions/${deviceId}`);

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }) as any,
    });

    this.sessions.set(deviceId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && this.onQrReceived) {
        this.onQrReceived(deviceId, qr);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        this.sessions.delete(deviceId);

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
