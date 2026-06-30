// src/modules/campaigns/campaigns.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'campaigns_queue',
    }),
  ],
  exports: [BullModule],
})
export class CampaignsModule {}
