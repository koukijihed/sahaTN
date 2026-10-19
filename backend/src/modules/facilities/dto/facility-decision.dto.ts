import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export const FACILITY_DECISION_ACTIONS = [
  'START_REVIEW',
  'REQUEST_CORRECTION',
  'APPROVE',
  'REJECT',
  'SUSPEND'
] as const;

export type FacilityDecisionAction = (typeof FACILITY_DECISION_ACTIONS)[number];

export class FacilityDecisionDto {
  @ApiProperty({ enum: FACILITY_DECISION_ACTIONS, example: 'APPROVE' })
  @IsIn(FACILITY_DECISION_ACTIONS)
  action!: FacilityDecisionAction;

  @ApiPropertyOptional({ example: 'Dossier conforme' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason?: string;
}