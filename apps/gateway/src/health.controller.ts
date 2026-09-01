import { Controller, Get, SerializeOptions } from '@nestjs/common';
import { z } from 'zod';

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('gateway'),
  timestamp: z.iso.datetime(),
});

@Controller()
export class HealthController {
  @Get('health')
  @SerializeOptions({ schema: healthResponseSchema })
  health() {
    return {
      status: 'ok',
      service: 'gateway',
      timestamp: new Date().toISOString(),
    };
  }
}
