import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ChatsService } from '../../application/services/chats.service';
import { UpdateChatStatusDto } from '../../application/dtos/update-chat-status.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  async getChats() {
    return this.chatsService.getChats();
  }

  @Get(':customerId/messages')
  async getMessages(@Param('customerId') customerId: string) {
    return this.chatsService.getMessages(customerId);
  }

  @Post(':customerId/messages')
  async sendMessage(
    @Param('customerId') customerId: string,
    @Body() body: { content: string; deviceId?: string },
  ) {
    return this.chatsService.sendMessage(customerId, body.content, body.deviceId);
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateChatStatusDto,
  ) {
    return this.chatsService.updateStatus(id, dto.status);
  }
}
