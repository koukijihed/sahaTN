import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const VERIFICATION_DECISION_ACTIONS = [
  'START_REVIEW',
  'REQUEST_CORRECTION',
  'APPROVE',
  'REJECT',
  'REVOKE'
] as const;

export type VerificationDecisionAction =
  (typeof VERIFICATION_DECISION_ACTIONS)[number];

export class VerificationDecisionDto {
  @ApiProperty({ enum: VERIFICATION_DECISION_ACTIONS })
  @IsIn(VERIFICATION_DECISION_ACTIONS)
  action!: VerificationDecisionAction;

  @ApiPropertyOptional({
    description:
      'Motif administratif. Requis pour REQUEST_CORRECTION, REJECT et REVOKE.'
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  reason?: string;
}