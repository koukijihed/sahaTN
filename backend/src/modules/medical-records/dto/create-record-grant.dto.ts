import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecordGrantPermission } from '@prisma/client';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';

export class CreateRecordGrantDto {
  @ApiProperty({
    description:
      'Profil professionnel VERIFIE destinataire de l\'autorisation.'
  })
  @IsUUID()
  doctorProfileId!: string;

  @ApiProperty({
    enum: RecordGrantPermission,
    isArray: true,
    description:
      'Portees accordees (lecture et/ou ecriture). Au moins une. La lecture et '
        + 'l\'ecriture sont distinctes.'
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RecordGrantPermission, { each: true })
  permissions!: RecordGrantPermission[];

  @ApiPropertyOptional({
    description: 'Debut d\'effet (defaut : maintenant).'
  })
  @IsOptional()
  @IsISO8601()
  effectiveAt?: string;

  @ApiPropertyOptional({
    description: 'Fin d\'effet (defaut : aucune expiration).'
  })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'Suivi post-operatoire' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
