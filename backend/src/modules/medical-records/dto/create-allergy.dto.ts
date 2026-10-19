import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AllergySeverity,
  AllergySource,
  AllergyStatus,
  ClinicalDataCertainty
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class CreateAllergyDto {
  @ApiProperty({ example: 'Penicilline' })
  @IsString()
  @MaxLength(500)
  allergen!: string;

  @ApiPropertyOptional({ example: 'Urticaire generalisee' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reaction?: string;

  @ApiPropertyOptional({ enum: AllergySeverity })
  @IsOptional()
  @IsEnum(AllergySeverity)
  severity?: AllergySeverity;

  @ApiPropertyOptional({ enum: AllergySource })
  @IsOptional()
  @IsEnum(AllergySource)
  source?: AllergySource;

  @ApiPropertyOptional({ enum: ClinicalDataCertainty })
  @IsOptional()
  @IsEnum(ClinicalDataCertainty)
  certainty?: ClinicalDataCertainty;

  @ApiPropertyOptional({ enum: AllergyStatus })
  @IsOptional()
  @IsEnum(AllergyStatus)
  status?: AllergyStatus;

  @ApiProperty({ example: '2026-11-02T10:05:00.000Z' })
  @IsDateString()
  recordedAt!: string;
}
