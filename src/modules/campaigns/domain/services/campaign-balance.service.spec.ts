import { CampaignBalanceService } from './campaign-balance.service';

describe('CampaignBalanceService', () => {
  let service: CampaignBalanceService;

  beforeEach(() => {
    service = new CampaignBalanceService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('distributeLoad', () => {
    it('should distribute load exactly (300 customers, 3 devices -> 100 assignments each)', () => {
      const customers = Array.from({ length: 300 }, (_, i) => ({
        id: `c-${i}`,
        phone: `12345678${i}`,
      }));
      const deviceIds = ['d-1', 'd-2', 'd-3'];

      const result = service.distributeLoad(customers, deviceIds);

      expect(result).toHaveLength(300);

      const deviceCounts: { [key: string]: number } = {};
      for (const assignment of result) {
        deviceCounts[assignment.deviceId] =
          (deviceCounts[assignment.deviceId] || 0) + 1;
      }

      expect(deviceCounts['d-1']).toBe(100);
      expect(deviceCounts['d-2']).toBe(100);
      expect(deviceCounts['d-3']).toBe(100);
    });

    it('should distribute load correctly when irregular (10 customers, 3 devices -> 4, 3, 3)', () => {
      const customers = Array.from({ length: 10 }, (_, i) => ({
        id: `c-${i}`,
        phone: `12345678${i}`,
      }));
      const deviceIds = ['d-1', 'd-2', 'd-3'];

      const result = service.distributeLoad(customers, deviceIds);

      expect(result).toHaveLength(10);

      const deviceCounts: { [key: string]: number } = {};
      for (const assignment of result) {
        deviceCounts[assignment.deviceId] =
          (deviceCounts[assignment.deviceId] || 0) + 1;
      }

      expect(deviceCounts['d-1']).toBe(4);
      expect(deviceCounts['d-2']).toBe(3);
      expect(deviceCounts['d-3']).toBe(3);
    });

    it('should throw an error if customers array is empty or null', () => {
      const deviceIds = ['d-1', 'd-2'];

      expect(() => service.distributeLoad([], deviceIds)).toThrow(
        'Customers array cannot be empty for load distribution',
      );
      expect(() =>
        service.distributeLoad(null as unknown as unknown[], deviceIds),
      ).toThrow('Customers array cannot be empty for load distribution');
    });

    it('should throw an error if deviceIds array is empty or null', () => {
      const customers = [{ id: 'c-1', phone: '123456789' }];

      expect(() => service.distributeLoad(customers, [])).toThrow(
        'Device IDs array cannot be empty for load distribution',
      );
      expect(() =>
        service.distributeLoad(customers, null as unknown as string[]),
      ).toThrow('Device IDs array cannot be empty for load distribution');
    });
  });
});
