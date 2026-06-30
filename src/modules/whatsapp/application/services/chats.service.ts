import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Message } from '../../infrastructure/entities/message.entity';

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async updateStatus(messageId: string, status: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
    });
    if (!message) {
      throw new NotFoundException(`Message with ID ${messageId} not found`);
    }

    message.status = status;
    const updatedMessage = await this.messageRepository.save(message);

    this.eventEmitter.emit('whatsapp.chat.status_updated', {
      messageId,
      status,
    });

    return updatedMessage;
  }
}
