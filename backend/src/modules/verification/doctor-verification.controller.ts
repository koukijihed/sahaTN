import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateVerificationRequestDto } from './dto/create-verification-request.dto';
import { VerificationService } from './verification.service';

@ApiTags('doctor-verification')
@UseGuards(SessionAuthGuard)
@Controller('doctors/me/verification')
export class DoctorVerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Creer (brouillon) ou soumettre sa propre demande de verification. En cas de demande active, soumet le brouillon ou la correction.'
  })
  async create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateVerificationRequestDto
  ): Promise<{ request: unknown }> {
    const request = await this.verificationService.createOrSubmit(
      user!.id,
      dto.submit ?? false
    );
    return { request };
  }

  @Get()
  @ApiOperation({
    summary: 'Consulter sa derniere demande de verification (et son historique)'
  })
  async get(
    @CurrentUser() user: AuthenticatedUser | undefined
  ): Promise<{ request: unknown }> {
    const request = await this.verificationService.getMine(user!.id);
    return { request };
  }
}