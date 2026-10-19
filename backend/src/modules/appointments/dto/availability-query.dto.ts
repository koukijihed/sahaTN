import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class AvailabilityQueryDto {
  @ApiPropertyOptional({
    example: '2026-11-02',
    description: 'Journee de debut (inclus) dans le fuseau de l\'agenda'
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'from must be YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-11-16',
    description: 'Journee de fin (inclus) dans le fuseau de l\'agenda'
  })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}