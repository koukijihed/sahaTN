import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  Matches
} from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class GenerateSlotsDto {
  @ApiProperty({ example: '2026-11-02' })
  @IsNotEmpty()
  @Matches(DATE_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ example: '09:00', description: 'Heure locale (fuseau agenda)' })
  @IsNotEmpty()
  @Matches(TIME_PATTERN, { message: 'startTime must be HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '13:00', description: 'Heure locale (fuseau agenda)' })
  @IsNotEmpty()
  @Matches(TIME_PATTERN, { message: 'endTime must be HH:MM' })
  endTime!: string;

  @ApiPropertyOptional({
    description:
      'Supprimer les creneaux OUVERTS de la date avant de regenerer (refuse si un creneau est resserve)'
  })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}