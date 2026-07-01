import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ChatsService } from '../../application/services/chats.service';
import { UpdateChatStatusDto } from '../../application/dtos/update-chat-status.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  async getChats(@Query('deviceId') deviceId?: string) {
    return this.chatsService.getChats(deviceId);
  }

  @Get('metrics')
  async getMetrics() {
    return this.chatsService.getMetrics();
  }

  @Get(':customerId/messages')
  async getMessages(
    @Param('customerId') customerId: string,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.chatsService.getMessages(customerId, deviceId);
  }

  @Post(':customerId/messages')
  async sendMessage(
    @Param('customerId') customerId: string,
    @Body() body: { content: string; deviceId?: string; mediaUrl?: string },
  ) {
    return this.chatsService.sendMessage(customerId, body.content, body.deviceId, body.mediaUrl);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateChatStatusDto,
  ) {
    return this.chatsService.updateStatus(id, dto.status);
  }
}
