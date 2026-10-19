import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const DECIDE_ACTIONS = [
  'CONFIRM',
  'REJECT',
  'COMPLETE',
  'NO_SHOW'
] as const;

export type DecideAppointmentAction = (typeof DECIDE_ACTIONS)[number];

export class DecideAppointmentDto {
  @ApiProperty({
    enum: DECIDE_ACTIONS,
    description:
      'CONFIRM/REJECT depuis PENDING ; COMPLETE/NO_SHOW depuis CONFIRMED. '
        + 'REJECT requiert un motif.'
  })
  @IsIn(DECIDE_ACTIONS)
  action!: DecideAppointmentAction;

  @ApiPropertyOptional({ example: 'Creneau annule par le praticien' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}