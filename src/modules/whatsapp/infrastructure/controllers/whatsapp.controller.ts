// src/modules/whatsapp/infrastructure/controllers/whatsapp.controller.ts
import { Controller, Param, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service';

@Controller('whatsapp')
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Post(':deviceId/start')
  @HttpCode(HttpStatus.OK)
  async startConnection(@Param('deviceId') deviceId: string) {
    await this.whatsappService.startConnection(deviceId);
    return {
      status: 'success',
      message: `Connection initialization started for device ${deviceId}`,
    };
  }
}
