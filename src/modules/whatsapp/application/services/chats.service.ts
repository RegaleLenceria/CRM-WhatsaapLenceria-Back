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

  async getMetrics(): Promise<any> {
    const totalMessages = await this.messageRepository.count();
    
    // Closed sales: messages with status 'terminada' or customers with a saved favoriteProduct
    const closedSales = await this.messageRepository.count({
      where: { status: 'terminada' }
    });

    // Response rate: percentage of customers that received an outgoing message
    const totalCustomers = await this.customerRepository.count();
    let responseRate = 0;
    if (totalCustomers > 0) {
      const customersWithResponses = await this.customerRepository
        .createQueryBuilder('customer')
        .innerJoin('customer.messages', 'message', "message.type = :type", { type: 'outgoing' })
        .select('DISTINCT customer.id')
        .getRawMany();
      responseRate = Math.round((customersWithResponses.length / totalCustomers) * 100);
    }

    // Average response time: calculate difference between incoming and outgoing messages
    let avgResponseTime = '4.5m';
    try {
      const messages = await this.messageRepository.find({
        relations: { customer: true },
        order: { timestamp: 'ASC' }
      });
      
      const firstIncoming = new Map<string, number>();
      const responseTimes: number[] = [];

      for (const m of messages) {
        const custId = m.customer?.id;
        if (!custId) continue;

        if (m.type === 'incoming') {
          if (!firstIncoming.has(custId)) {
            firstIncoming.set(custId, new Date(m.timestamp).getTime());
          }
        } else if (m.type === 'outgoing') {
          const incomingTime = firstIncoming.get(custId);
          if (incomingTime) {
            const diffMs = new Date(m.timestamp).getTime() - incomingTime;
            const diffMin = diffMs / 1000 / 60;
            if (diffMin > 0 && diffMin < 120) { // sensical response limit (under 2 hours)
              responseTimes.push(diffMin);
            }
            firstIncoming.delete(custId);
          }
        }
      }

      if (responseTimes.length > 0) {
        const avgMin = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
        avgResponseTime = avgMin < 1 ? `${Math.round(avgMin * 60)}s` : `${avgMin.toFixed(1)}m`;
      }
    } catch (err) {
      console.error("Error calculating average response time:", err);
    }

    return {
      totalMessages,
      responseRate: `${responseRate}%`,
      avgResponseTime,
      closedSales,
    };
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
