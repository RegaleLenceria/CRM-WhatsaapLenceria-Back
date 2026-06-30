// src/modules/campaigns/campaigns.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Customer } from '../customers/infrastructure/entities/customer.entity';
import { CampaignsController } from './infrastructure/controllers/campaigns.controller';
import { CampaignsService } from './application/services/campaigns.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer]),
    BullModule.registerQueue({
      name: 'campaigns_queue',
    }),
  ],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [BullModule],
})
export class CampaignsModule {}
