import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MedicalDocumentCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class UploadMedicalDocumentDto {
  @ApiProperty({ enum: MedicalDocumentCategory })
  @IsEnum(MedicalDocumentCategory)
  category!: MedicalDocumentCategory;

  @ApiPropertyOptional({
    description:
      'Consultation a rattacher (facultatif). Doit appartenir au meme dossier.'
  })
  @IsOptional()
  @IsUUID()
  encounterId?: string;
}
