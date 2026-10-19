import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  AppointmentConfirmationMode,
  AppointmentScheduleStatus
} from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from 'class-validator';

export class UpdateScheduleDto {
  @ApiPropertyOptional({ example: 'Africa/Tunis' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 30, minimum: 5, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  visitDurationMinutes?: number;

  @ApiPropertyOptional({
    enum: AppointmentConfirmationMode,
    description:
      'Politique de confirmation : AUTOMATIC (confirmation immediate), '
        + 'MANUAL (decision du praticien), DISABLED (pas de reservation en ligne)'
  })
  @IsOptional()
  @IsEnum(AppointmentConfirmationMode)
  confirmationMode?: AppointmentConfirmationMode;

  @ApiPropertyOptional({
    description:
      'Representation historique de confirmationMode (true => MANUAL, '
        + 'false => AUTOMATIC). A preferer : confirmationMode.'
  })
  @IsOptional()
  @IsBoolean()
  requiresConfirmation?: boolean;

  @ApiPropertyOptional({ enum: AppointmentScheduleStatus })
  @IsOptional()
  @IsEnum(AppointmentScheduleStatus)
  status?: AppointmentScheduleStatus;
}