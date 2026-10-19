import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Statut de disponibilité du service.' })
  check(): {
    status: string;
    service: string;
    timestamp: string;
    uptime: number;
  } {
    return {
      status: 'ok',
      service: 'sahatn-backend',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    };
  }
}
