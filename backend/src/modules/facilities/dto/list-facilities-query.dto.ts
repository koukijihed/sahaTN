import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FacilitySector, FacilityType, Governorate } from '@prisma/client';
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
  FACILITY_SORTS
} from '../../../common/constants/search.constants';

const MAX_LIMIT = 50;

export class ListFacilitiesQueryDto {
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

  @ApiPropertyOptional({ example: 'radiotherapie' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: Governorate, example: Governorate.NABEUL })
  @IsOptional()
  @IsEnum(Governorate)
  governorate?: Governorate;

  @ApiPropertyOptional({ enum: FacilitySector, example: FacilitySector.PUBLIC })
  @IsOptional()
  @IsEnum(FacilitySector)
  sector?: FacilitySector;

  @ApiPropertyOptional({ enum: FacilityType, example: FacilityType.HOSPITAL })
  @IsOptional()
  @IsEnum(FacilityType)
  type?: FacilityType;

  @ApiPropertyOptional({ example: '01234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsUUID('4')
  specialtyId?: string;

  @ApiPropertyOptional({ enum: FACILITY_SORTS, example: 'name' })
  @IsOptional()
  @IsIn(FACILITY_SORTS)
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