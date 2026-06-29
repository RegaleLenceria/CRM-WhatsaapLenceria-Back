// src/modules/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './infrastructure/entities/device.entity';
import { Message } from './infrastructure/entities/message.entity';
import { WhatsappService } from './infrastructure/services/whatsapp.service';
import { WhatsappGateway } from './infrastructure/gateways/whatsapp.gateway';
import { WhatsappController } from './infrastructure/controllers/whatsapp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Device, Message])],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappGateway],
  exports: [TypeOrmModule, WhatsappService],
})
export class WhatsappModule {}
