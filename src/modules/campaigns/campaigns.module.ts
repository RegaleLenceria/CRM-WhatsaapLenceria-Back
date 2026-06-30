// src/modules/campaigns/campaigns.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Customer } from '../customers/infrastructure/entities/customer.entity';
import { Device } from '../whatsapp/infrastructure/entities/device.entity';
import { CampaignsController } from './infrastructure/controllers/campaigns.controller';
import { CampaignsService } from './application/services/campaigns.service';
import { CampaignProcessor } from './infrastructure/processors/campaign.processor';
import { BirthdayCronService } from './application/services/birthday-cron.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Device]),
    BullModule.registerQueue({
      name: 'campaigns_queue',
    }),
    WhatsappModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignProcessor, BirthdayCronService],
  exports: [BullModule],
})
export class CampaignsModule {}
