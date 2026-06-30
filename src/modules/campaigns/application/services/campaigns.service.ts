import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Customer } from '../../../customers/infrastructure/entities/customer.entity';
import { CreateCampaignDto } from '../dtos/create-campaign.dto';
import { CampaignBalanceService } from '../../domain/services/campaign-balance.service';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectQueue('campaigns_queue')
    private readonly campaignsQueue: Queue,
    private readonly campaignBalanceService: CampaignBalanceService,
  ) {}

  async createAndDispatchCampaign(dto: CreateCampaignDto) {
    const where: FindOptionsWhere<Customer> = {};
    if (dto.genderFilter) {
      where.gender = dto.genderFilter;
    }
    if (dto.productFilter) {
      where.favoriteProduct = dto.productFilter;
    }

    const customers = await this.customerRepository.find({ where });

    if (customers.length === 0) {
      return {
        totalCustomers: 0,
        devicesUsed: dto.deviceIds.length,
        message: 'No se encontraron clientes para la campaña',
      };
    }

    const distributions = this.campaignBalanceService.distributeLoad(
      customers,
      dto.deviceIds,
    );

    for (const distribution of distributions) {
      const { customer, deviceId } = distribution;

      await this.campaignsQueue.add('send_campaign_message', {
        customerId: customer.id,
        phone: customer.phone,
        text: dto.text,
        mediaUrl: dto.mediaUrl,
        deviceId: deviceId,
      });
    }

    return {
      totalCustomers: customers.length,
      devicesUsed: dto.deviceIds.length,
      message: 'Campaña encolada exitosamente',
    };
  }
}
