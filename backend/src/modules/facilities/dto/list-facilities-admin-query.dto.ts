import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { FacilityVerificationStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_LIMIT = 50;

export class ListFacilitiesAdminQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ enum: FacilityVerificationStatus, example: FacilityVerificationStatus.PENDING })
  @IsOptional()
  @IsEnum(FacilityVerificationStatus)
  status?: FacilityVerificationStatus;
}