import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'patient@example.tn' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiPropertyOptional({ example: '+21612345678' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^\+?[0-9][0-9 \-]{5,19}$/, {
    message: 'phone must be a valid phone number'
  })
  phone?: string;

  @ApiProperty({ example: 'Passw0rd!2345', minLength: 12 })
  @IsString()
  @MinLength(12, { message: 'password must be at least 12 characters long' })
  @MaxLength(128)
  @Matches(/[A-Za-z]/, {
    message: 'password must contain at least one letter'
  })
  @Matches(/[0-9]/, { message: 'password must contain at least one digit' })
  password!: string;
}
