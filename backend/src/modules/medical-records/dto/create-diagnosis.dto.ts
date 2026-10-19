import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClinicalDiagnosisStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';

export class CreateDiagnosisDto {
  @ApiPropertyOptional({
    description: 'Consultation de rattachement (facultatif) du meme dossier.'
  })
  @IsOptional()
  @IsUUID()
  encounterId?: string;

  @ApiPropertyOptional({ example: 'K35.8' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @ApiProperty({ example: 'Appendicite aigue' })
  @IsString()
  @MaxLength(500)
  label!: string;

  @ApiPropertyOptional({ example: 'Confirmee par echographie.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: ClinicalDiagnosisStatus })
  @IsOptional()
  @IsEnum(ClinicalDiagnosisStatus)
  status?: ClinicalDiagnosisStatus;

  @ApiProperty({ example: '2026-11-02T10:00:00.000Z' })
  @IsDateString()
  diagnosedAt!: string;
}
