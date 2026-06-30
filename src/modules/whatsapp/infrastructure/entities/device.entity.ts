// src/modules/whatsapp/infrastructure/entities/device.entity.ts
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Message } from './message.entity';

@Entity('devices')
export class Device {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  phoneNumber: string;

  @Column({ type: 'boolean' })
  isOnline: boolean;

  @Column({ type: 'jsonb', nullable: true })
  sessionTokens: any;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Message, (message) => message.device)
  messages: Message[];
}
