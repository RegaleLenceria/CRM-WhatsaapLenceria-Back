import { Injectable } from '@nestjs/common';

@Injectable()
export class CampaignBalanceService {
  distributeLoad<T>(
    customers: T[],
    deviceIds: string[],
  ): { customer: T; deviceId: string }[] {
    if (!customers || customers.length === 0) {
      throw new Error('Customers array cannot be empty for load distribution');
    }
    if (!deviceIds || deviceIds.length === 0) {
      throw new Error('Device IDs array cannot be empty for load distribution');
    }

    return customers.map((customer, index) => {
      const assignedDeviceId = deviceIds[index % deviceIds.length];
      return {
        customer,
        deviceId: assignedDeviceId,
      };
    });
  }
}
