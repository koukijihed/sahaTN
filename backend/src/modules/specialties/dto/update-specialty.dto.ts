import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSpecialtyDto {
  @ApiPropertyOptional({ example: 'Cardiologie' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  labelFr?: string;

  @ApiPropertyOptional({ example: 'أمراض القلب' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelAr?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}