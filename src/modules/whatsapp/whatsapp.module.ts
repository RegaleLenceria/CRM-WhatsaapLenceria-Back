// src/modules/whatsapp/whatsapp.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './infrastructure/entities/device.entity';
import { Message } from './infrastructure/entities/message.entity';
import { Customer } from '../customers/infrastructure/entities/customer.entity';
import { Setting } from './infrastructure/entities/setting.entity';
import { WhatsappService } from './infrastructure/services/whatsapp.service';
import { WhatsappGateway } from './infrastructure/gateways/whatsapp.gateway';
import { WhatsappController } from './infrastructure/controllers/whatsapp.controller';
import { ChatsController } from './infrastructure/controllers/chats.controller';
import { ChatsService } from './application/services/chats.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Device, Message, Customer, Setting]), AuthModule],
  controllers: [WhatsappController, ChatsController],
  providers: [WhatsappService, WhatsappGateway, ChatsService],
  exports: [TypeOrmModule, WhatsappService],
})
export class WhatsappModule {}
