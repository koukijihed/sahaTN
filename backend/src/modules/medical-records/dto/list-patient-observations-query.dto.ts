import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListPatientObservationsQueryDto {
  @ApiPropertyOptional({
    description: 'Restreindre aux observations d\'une consultation precise.'
  })
  @IsOptional()
  @IsUUID()
  encounterId?: string;
}
