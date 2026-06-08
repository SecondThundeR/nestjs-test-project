import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports the gateway as healthy with a timestamp', () => {
    const before = Date.now();
    const result = controller.health();

    expect(result).toMatchObject({ status: 'ok', service: 'gateway' });
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
    expect(Date.parse(result.timestamp)).toBeGreaterThanOrEqual(before);
  });
});
