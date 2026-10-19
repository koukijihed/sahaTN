import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FacilitySector, Governorate } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min
} from 'class-validator';
import {
  AVAILABILITY_FILTER_MESSAGE,
  AVAILABILITY_FILTER_MESSAGE_SUFFIX,
  DOCTOR_SORTS,
  SUPPORTED_LANGUAGES
} from '../../../common/constants/search.constants';

const MAX_LIMIT = 50;

export class ListDoctorsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ example: 'Trabelsi' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ example: '01234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsUUID('4')
  specialtyId?: string;

  @ApiPropertyOptional({ example: '01234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsUUID('4')
  facilityId?: string;

  @ApiPropertyOptional({ enum: Governorate, example: Governorate.TUNIS })
  @IsOptional()
  @IsEnum(Governorate)
  governorate?: Governorate;

  @ApiPropertyOptional({ enum: FacilitySector, example: FacilitySector.PRIVATE })
  @IsOptional()
  @IsEnum(FacilitySector)
  sector?: FacilitySector;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES, example: 'fr' })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: string;

  @ApiPropertyOptional({ enum: DOCTOR_SORTS, example: 'newest' })
  @IsOptional()
  @IsIn(DOCTOR_SORTS)
  sort?: string;

  // Filtres de disponibilite : refuses tant que les agendas (Phase 3) n'existent
  // pas. Aucune disponibilite n'est jamais simulee.
  @ApiPropertyOptional({
    description: 'Refuse tant que la prise de rendez-vous en ligne est indisponible'
  })
  @IsOptional()
  @IsIn([], {
    message: `${AVAILABILITY_FILTER_MESSAGE}${AVAILABILITY_FILTER_MESSAGE_SUFFIX}`
  })
  availability?: string;
}