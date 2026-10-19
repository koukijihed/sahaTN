import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestEmergencyAccessDto {
  @ApiProperty({
    example:
      'Patient inconscient admis aux urgences : necessite de connaitre les '
      + 'allergies et traitements en cours.'
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(20, {
    message: 'justification must be a meaningful text (min 20 characters)'
  })
  @MaxLength(2000)
  justification!: string;
}
