import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GrantFacilityManagerDto {
  @ApiProperty({ example: '01234567-89ab-cdef-0123-456789abcdef' })
  @IsString()
  @IsNotEmpty()
  userId!: string;
}