import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength
} from 'class-validator';

export class BookAppointmentDto {
  @ApiProperty({ example: '0b7f8a9a-...' })
  @IsUUID()
  slotId!: string;

  @ApiPropertyOptional({ example: 'Douleur persistante au genou droit' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Cle d\'idempotence du client : rejouer la meme reservation (meme cle) '
        + 'renvoie le rendez-vous deja cree au lieu d\'en creer un second.'
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_\-]{1,64}$/, {
    message: 'idempotencyKey must be 1-64 chars of [A-Za-z0-9_-]'
  })
  idempotencyKey?: string;
}