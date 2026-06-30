// src/modules/whatsapp/infrastructure/gateways/whatsapp.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { WhatsappService } from '../services/whatsapp.service';
import { Message } from '../entities/message.entity';

@WebSocketGateway({ cors: true })
export class WhatsappGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly whatsappService: WhatsappService) {}

  afterInit() {
    this.whatsappService.onQrReceived = (deviceId: string, qr: string) => {
      this.server.emit('qr_update', { deviceId, qr });
    };

    this.whatsappService.onMessageReceived = (message: Message) => {
      this.server.emit('new_incoming_message', message);
    };
  }
}
