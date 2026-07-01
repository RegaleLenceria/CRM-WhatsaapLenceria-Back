// src/modules/whatsapp/infrastructure/controllers/whatsapp.controller.ts
import { Controller, Get, Post, Param, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { WhatsappService } from '../services/whatsapp.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly whatsappService: WhatsappService) {}

  @Get('devices')
  async getDevices() {
    return this.whatsappService.getDevices();
  }

  @Post('devices')
  async createDevice(
    @Body() body: { id: string; name: string; phoneNumber: string },
  ) {
    return this.whatsappService.createDevice(body.id, body.name, body.phoneNumber);
  }

  @Post(':deviceId/start')
  @HttpCode(HttpStatus.OK)
  async startConnection(@Param('deviceId') deviceId: string) {
    await this.whatsappService.startConnection(deviceId);
    return {
      status: 'success',
      message: `Connection initialization started for device ${deviceId}`,
    };
  }

  @Get('settings/:key')
  async getSetting(@Param('key') key: string) {
    return this.whatsappService.getSetting(key);
  }

  @Post('settings')
  async saveSetting(@Body() body: { key: string; value: string }) {
    return this.whatsappService.saveSetting(body.key, body.value);
  }
}
