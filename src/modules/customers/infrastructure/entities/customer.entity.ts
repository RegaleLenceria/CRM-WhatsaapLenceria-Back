// src/modules/customers/infrastructure/entities/customer.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Message } from '../../../whatsapp/infrastructure/entities/message.entity';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column()
  name: string;

  @Column({ type: 'date', nullable: true })
  birthday: Date;

  @Column({ nullable: true })
  gender: string;

  @Column({ nullable: true })
  favoriteProduct: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Message, (message) => message.customer)
  messages: Message[];
}
