import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsappService } from '../services/whatsapp.service';
import { Message } from '../entities/message.entity';

@WebSocketGateway({ cors: { origin: '*' } })
export class WhatsappGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit() {
    this.whatsappService.onQrReceived = (deviceId: string, qr: string) => {
      this.server.emit('qr_update', { deviceId, qr });
    };

    this.whatsappService.onMessageReceived = (message: Message) => {
      this.server.emit('new_incoming_message', message);
    };
  }

  async handleConnection(client: Socket) {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
    try {
      const authHeader = client.handshake?.headers?.authorization as unknown as string | undefined;
      const authObjectToken = client.handshake?.auth?.token as unknown as string | undefined;
      const queryToken = client.handshake?.query?.token as unknown as string | undefined;

      let token: string | null = null;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else if (authHeader) {
        token = authHeader;
      } else if (authObjectToken && authObjectToken.startsWith('Bearer ')) {
        token = authObjectToken.split(' ')[1];
      } else if (authObjectToken) {
        token = authObjectToken;
      } else if (queryToken) {
        token = typeof queryToken === 'string' ? queryToken : (queryToken as string[])[0];
      }

      if (!token) {
        console.log(`WebSocket client connection rejected: no token provided.`);
        client.disconnect();
        return;
      }

      await this.jwtService.verifyAsync(token);
      console.log(`WebSocket client connected successfully: ${client.id}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(
        `WebSocket client connection rejected: invalid token. Error: ${errorMessage}`,
      );
      client.disconnect();
    }
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
  }

  handleDisconnect(client: Socket) {
    console.log(`WebSocket client disconnected: ${client.id}`);
  }

  @OnEvent('whatsapp.message.new')
  handleNewIncomingMessage(payload: any) {
    this.server.emit('new_message', payload);
  }
}
