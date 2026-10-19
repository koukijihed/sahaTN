import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeRecordGrantDto {
  @ApiPropertyOptional({ example: 'Le patient retire son consentement.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
