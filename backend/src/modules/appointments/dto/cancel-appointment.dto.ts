import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelAppointmentDto {
  @ApiPropertyOptional({ example: 'Conflit d\'emploi du temps' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}