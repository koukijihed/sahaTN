import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const AFFILIATION_DECISION_ACTIONS = ['APPROVE', 'REJECT'] as const;

export type AffiliationDecisionAction = (typeof AFFILIATION_DECISION_ACTIONS)[number];

export class AffiliationDecisionDto {
  @ApiProperty({ enum: AFFILIATION_DECISION_ACTIONS, example: 'APPROVE' })
  @IsIn(AFFILIATION_DECISION_ACTIONS)
  action!: AffiliationDecisionAction;

  @ApiPropertyOptional({ example: 'Convention de collaboration en cours' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason?: string;
}