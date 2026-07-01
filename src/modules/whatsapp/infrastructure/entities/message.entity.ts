// src/modules/whatsapp/infrastructure/entities/message.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Customer } from '../../../customers/infrastructure/entities/customer.entity';
import { Device } from './device.entity';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  whatsappMessageId: string;

  @Column()
  type: string;

  @Column({ type: 'text' })
  content: string;

  @Column()
  status: string;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'varchar', default: 'sent' })
  receipt: string;

  @Column({ type: 'timestamp' })
  timestamp: Date;

  @ManyToOne(() => Customer, (customer) => customer.messages)
  customer: Customer;

  @ManyToOne(() => Device, (device) => device.messages)
  device: Device;
}
