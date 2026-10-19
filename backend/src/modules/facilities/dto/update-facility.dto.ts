import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  FacilitySector,
  FacilityType,
  Governorate
} from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateFacilityDto {
  @ApiPropertyOptional({ example: 'Hopital Regional de Nabeul' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Hopital Regional de Nabeul - Bizerte' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  officialName?: string | null;

  @ApiPropertyOptional({ example: 'Etablissement public de reference de la region' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: FacilitySector })
  @IsOptional()
  @IsEnum(FacilitySector)
  sector?: FacilitySector;

  @ApiPropertyOptional({ enum: FacilityType })
  @IsOptional()
  @IsEnum(FacilityType)
  type?: FacilityType;

  @ApiPropertyOptional({ example: 'LIC-2024-000123' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseReference?: string | null;

  @ApiPropertyOptional({ example: 'ANN-2024-0042' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceReference?: string | null;

  @ApiPropertyOptional({ example: 'Avenue Habib Bourguiba' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  addressLine?: string;

  @ApiPropertyOptional({ example: 'Nabeul' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ enum: Governorate })
  @IsOptional()
  @IsEnum(Governorate)
  governorate?: Governorate;

  @ApiPropertyOptional({ example: 'Nabeul Ville' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  delegation?: string | null;

  @ApiPropertyOptional({ example: '8000' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string | null;

  @ApiPropertyOptional({ example: '+216 72 000 000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'https://example.gov.tn' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  websiteUrl?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isPubliclyListed?: boolean;
}