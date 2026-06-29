// src/modules/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './infrastructure/entities/device.entity';
import { Message } from './infrastructure/entities/message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Device, Message])],
  exports: [TypeOrmModule],
})
export class WhatsappModule {}
