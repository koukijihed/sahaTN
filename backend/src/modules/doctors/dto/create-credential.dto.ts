import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CredentialType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

export class CreateCredentialDto {
  @ApiProperty({ enum: CredentialType, example: CredentialType.DIPLOMA })
  @IsEnum(CredentialType)
  type!: CredentialType;

  @ApiProperty({ example: 'Universite de Tunis' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  issuingBody!: string;

  @ApiPropertyOptional({ example: 'DIP-2020-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({ example: '2020-06-30' })
  @IsOptional()
  @IsDateString()
  obtainedAt?: string;
}