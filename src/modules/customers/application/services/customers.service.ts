import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../infrastructure/entities/customer.entity';
import { CreateCustomerDto } from '../dtos/create-customer.dto';
import { UpdateCustomerDto } from '../dtos/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
  ) {}

  async findAll(): Promise<Customer[]> {
    return this.customerRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findByPhone(phone: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { phone },
    });
    if (!customer) {
      throw new NotFoundException(
        `Customer with phone number ${phone} not found`,
      );
    }
    return customer;
  }

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const existing = await this.customerRepository.findOne({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new BadRequestException(
        `Customer with phone number ${dto.phone} already exists`,
      );
    }

    const customer = this.customerRepository.create({
      ...dto,
      name: dto.name || `Cliente ${dto.phone}`,
    });
    return this.customerRepository.save(customer);
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    if (dto.phone && dto.phone !== customer.phone) {
      const existing = await this.customerRepository.findOne({
        where: { phone: dto.phone },
      });
      if (existing) {
        throw new BadRequestException(
          `Customer with phone number ${dto.phone} already exists`,
        );
      }
    }

    Object.assign(customer, dto);
    return this.customerRepository.save(customer);
  }

  async findOrCreateByPhone(phone: string): Promise<Customer> {
    let customer = await this.customerRepository.findOne({
      where: { phone },
    });
    if (!customer) {
      customer = this.customerRepository.create({
        phone,
        name: `Cliente ${phone}`,
      });
      customer = await this.customerRepository.save(customer);
    }
    return customer;
  }
}
