import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { CampaignsService } from '../../application/services/campaigns.service';
import { CreateCampaignDto } from '../../application/dtos/create-campaign.dto';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  async createAndDispatchCampaign(@Body() dto: CreateCampaignDto) {
    return this.campaignsService.createAndDispatchCampaign(dto);
  }
}
