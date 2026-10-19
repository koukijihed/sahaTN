import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

export class UpsertDoctorProfileDto {
  @ApiPropertyOptional({ example: 'Dr Amina Ben Salah' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({ example: 'Medecin generaliste a Tunis.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  professionalDescription?: string;

  @ApiPropertyOptional({ example: ['fr', 'ar'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(70)
  yearsOfExperience?: number;

  @ApiPropertyOptional({
    example: ['06a6f1b2-1234-4aaa-9b1c-000000000001'],
    description: 'Identifiants de specialites actives du referentiel'
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  specialtyIds?: string[];
}