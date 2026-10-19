import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ClinicalDataCertainty,
  ClinicalObservationCategory
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class CreateObservationDto {
  @ApiProperty({ enum: ClinicalObservationCategory })
  @IsEnum(ClinicalObservationCategory)
  category!: ClinicalObservationCategory;

  @ApiPropertyOptional({ example: '8480-6' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @ApiProperty({ example: 'Tension arterielle systolique' })
  @IsString()
  @MaxLength(500)
  label!: string;

  @ApiPropertyOptional({ example: '120' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  valueText?: string;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @IsNumber()
  valueNumeric?: number;

  @ApiPropertyOptional({ example: 'mmHg' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  unit?: string;

  @ApiPropertyOptional({ enum: ClinicalDataCertainty })
  @IsOptional()
  @IsEnum(ClinicalDataCertainty)
  certainty?: ClinicalDataCertainty;

  @ApiProperty({ example: '2026-11-02T09:35:00.000Z' })
  @IsDateString()
  observedAt!: string;
}
