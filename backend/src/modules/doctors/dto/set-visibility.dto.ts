import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetVisibilityDto {
  @ApiProperty({ example: true, description: 'Apparaitre dans le repertoire public' })
  @IsBoolean()
  listed!: boolean;
}