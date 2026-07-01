import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Message } from '../../infrastructure/entities/message.entity';
import { Device } from '../../infrastructure/entities/device.entity';
import { Customer } from '../../../customers/infrastructure/entities/customer.entity';
import { WhatsappService } from '../../infrastructure/services/whatsapp.service';

@Injectable()
export class ChatsService {
  constructor(
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly whatsappService: WhatsappService,
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

  async getChats(): Promise<any[]> {
    const customers = await this.customerRepository.find({
      relations: {
        messages: true,
      },
    });

    const mapped = customers.map((c) => {
      const sortedMsgs = [...(c.messages || [])].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );
      const lastMsg = sortedMsgs[0];
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        lastMessage: lastMsg ? lastMsg.content : 'Sin mensajes',
        time: lastMsg
          ? lastMsg.timestamp.toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
        status: lastMsg ? lastMsg.status : 'pendiente',
        unread: c.messages
          ? c.messages.filter((m) => m.type === 'incoming' && !m.isRead).length
          : 0,
        initials: this.getInitials(c.name),
        birthday: c.birthday,
        gender: c.gender,
        favoriteProduct: c.favoriteProduct,
        lastMessageTimestamp: lastMsg ? lastMsg.timestamp.getTime() : 0,
      };
    });

    return mapped.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
  }

  async getMessages(customerId: string): Promise<Message[]> {
    return this.messageRepository.find({
      where: { customer: { id: customerId } },
      order: { timestamp: 'ASC' },
    });
  }

  async sendMessage(
    customerId: string,
    content: string,
    deviceId?: string,
  ): Promise<Message> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${customerId} not found`);
    }

    let device: Device | null = null;
    if (deviceId) {
      device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    } else {
      device = await this.deviceRepository.findOne({
        where: { isOnline: true },
      });
    }

    if (!device) {
      throw new BadRequestException(
        'No active WhatsApp device connected to send message',
      );
    }

    // Call baileys sending
    await this.whatsappService.sendMessage(device.id, customer.phone, content);

    const message = this.messageRepository.create({
      whatsappMessageId: `out-${Date.now()}`,
      type: 'outgoing',
      content,
      status: 'en_atencion',
      isRead: true,
      timestamp: new Date(),
      customer,
      device,
    });

    const saved = await this.messageRepository.save(message);

    this.eventEmitter.emit('whatsapp.message.new', saved);

    return saved;
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .filter((w) => w.length > 0)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }
}
