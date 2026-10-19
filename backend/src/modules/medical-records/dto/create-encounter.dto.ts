import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClinicalEncounterType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';

export class CreateEncounterDto {
  @ApiPropertyOptional({
    description:
      'Rendez-vous existant a rattacher (facultatif). S\'il est fourni, il doit '
        + 'etre un rendez-vous de soin confirme/cloture avec ce patient.'
  })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({ enum: ClinicalEncounterType })
  @IsOptional()
  @IsEnum(ClinicalEncounterType)
  type?: ClinicalEncounterType;

  @ApiProperty({ example: '2026-11-02T09:30:00.000Z' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ example: 'Douleur abdominale depuis 3 jours' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  chiefComplaint?: string;

  @ApiPropertyOptional({ example: 'Examen clinique sans signe de gravite.' })
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  notes?: string;
}
