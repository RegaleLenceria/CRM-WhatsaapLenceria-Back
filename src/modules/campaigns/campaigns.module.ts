// src/modules/campaigns/campaigns.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Customer } from '../customers/infrastructure/entities/customer.entity';
import { CampaignsController } from './infrastructure/controllers/campaigns.controller';
import { CampaignsService } from './application/services/campaigns.service';
import { CampaignProcessor } from './infrastructure/processors/campaign.processor';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer]),
    BullModule.registerQueue({
      name: 'campaigns_queue',
    }),
    WhatsappModule,
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignProcessor],
  exports: [BullModule],
})
export class CampaignsModule {}
