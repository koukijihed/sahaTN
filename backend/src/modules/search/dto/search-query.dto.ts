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
  SEARCH_TYPES,
  SUPPORTED_LANGUAGES
} from '../../../common/constants/search.constants';

const MAX_LIMIT = 20;

// Recherche combinee medecins + etablissements (Jour 5). Reutilise les services
// publics existants ; aucune duplication de la logique metier.
export class SearchQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ example: 'cardiologue' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ enum: SEARCH_TYPES, example: 'all' })
  @IsOptional()
  @IsIn(SEARCH_TYPES)
  type?: string;

  @ApiPropertyOptional({ enum: Governorate, example: Governorate.SFAX })
  @IsOptional()
  @IsEnum(Governorate)
  governorate?: Governorate;

  @ApiPropertyOptional({ enum: FacilitySector, example: FacilitySector.PUBLIC })
  @IsOptional()
  @IsEnum(FacilitySector)
  sector?: FacilitySector;

  @ApiPropertyOptional({ example: '01234567-89ab-cdef-0123-456789abcdef' })
  @IsOptional()
  @IsUUID('4')
  specialtyId?: string;

  @ApiPropertyOptional({ enum: SUPPORTED_LANGUAGES, example: 'ar' })
  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES)
  language?: string;

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