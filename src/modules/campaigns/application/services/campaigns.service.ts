import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Customer } from '../../../customers/infrastructure/entities/customer.entity';
import { CreateCampaignDto } from '../dtos/create-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectQueue('campaigns_queue')
    private readonly campaignsQueue: Queue,
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

    for (let index = 0; index < customers.length; index++) {
      const customer = customers[index];
      const assignedDeviceId = dto.deviceIds[index % dto.deviceIds.length];

      await this.campaignsQueue.add('send_campaign_message', {
        customerId: customer.id,
        phone: customer.phone,
        text: dto.text,
        mediaUrl: dto.mediaUrl,
        deviceId: assignedDeviceId,
      });
    }

    return {
      totalCustomers: customers.length,
      devicesUsed: dto.deviceIds.length,
      message: 'Campaña encolada exitosamente',
    };
  }
}
