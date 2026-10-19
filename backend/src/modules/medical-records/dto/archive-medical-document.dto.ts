import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ArchiveMedicalDocumentDto {
  @ApiPropertyOptional({ example: 'Document depose par erreur.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
