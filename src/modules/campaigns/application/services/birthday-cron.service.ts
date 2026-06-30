import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron } from '@nestjs/schedule';
import { Customer } from '../../../customers/infrastructure/entities/customer.entity';
import { Device } from '../../../whatsapp/infrastructure/entities/device.entity';

@Injectable()
export class BirthdayCronService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectQueue('campaigns_queue')
    private readonly campaignsQueue: Queue,
  ) {}

  @Cron('0 9 * * *')
  async scheduleBirthdayMessages(): Promise<void> {
    try {
      console.log('Running birthday messages cron job...');

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const targetMonth = tomorrow.getMonth() + 1;
      const targetDay = tomorrow.getDate();

      const customers = await this.customerRepository
        .createQueryBuilder('customer')
        .where('EXTRACT(MONTH FROM customer.birthday) = :month', {
          month: targetMonth,
        })
        .andWhere('EXTRACT(DAY FROM customer.birthday) = :day', {
          day: targetDay,
        })
        .getMany();

      if (customers.length === 0) {
        console.log('No customers have a birthday tomorrow.');
        return;
      }

      const activeDevices = await this.deviceRepository.find({
        where: { isOnline: true },
      });

      if (activeDevices.length === 0) {
        console.warn(
          'No active WhatsApp devices found to send birthday messages.',
        );
        return;
      }

      console.log(
        `Found ${customers.length} customers celebrating tomorrow. Distributing amongst ${activeDevices.length} online devices.`,
      );

      for (let index = 0; index < customers.length; index++) {
        const customer = customers[index];
        const assignedDeviceId = activeDevices[index % activeDevices.length].id;

        const message = `¡Hola ${customer.name}! En Regale Lencería vimos que mañana es tu cumpleaños 🎉. Como sabemos que te encantan los ${customer.favoriteProduct || 'conjuntos'}, queremos regalarte un descuento especial...`;

        await this.campaignsQueue.add('send_campaign_message', {
          phone: customer.phone,
          text: message,
          deviceId: assignedDeviceId,
        });
      }

      console.log(
        'Birthday messages successfully dispatched to campaigns queue.',
      );
    } catch (error) {
      console.error(
        'Error executing scheduleBirthdayMessages cron job:',
        error,
      );
    }
  }
}
