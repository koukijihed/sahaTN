import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateSpecialtyDto {
  @ApiProperty({ example: 'CARDIOLOGY' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value
  )
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'code must contain only uppercase letters, digits and underscores'
  })
  code!: string;

  @ApiProperty({ example: 'Cardiologie' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  labelFr!: string;

  @ApiPropertyOptional({ example: 'أمراض القلب' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  labelAr?: string;
}