import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CreateVerificationRequestDto {
  @ApiPropertyOptional({
    description:
      "true : creer ET soumettre la demande ; false (defaut) : creer un brouillon"
  })
  @IsOptional()
  @IsBoolean()
  submit?: boolean;
}