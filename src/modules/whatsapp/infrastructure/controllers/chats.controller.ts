import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ChatsService } from '../../application/services/chats.service';
import { UpdateChatStatusDto } from '../../application/dtos/update-chat-status.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateChatStatusDto,
  ) {
    return this.chatsService.updateStatus(id, dto.status);
  }
}
