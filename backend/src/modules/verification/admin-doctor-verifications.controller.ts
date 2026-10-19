import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';
import { VerificationDecisionDto } from './dto/verification-decision.dto';
import { VerificationService } from './verification.service';

@ApiTags('admin-doctor-verifications')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/doctor-verifications')
export class AdminDoctorVerificationsController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les demandes de verification (administrateurs)' })
  list(@Query() query: ListVerificationsQueryDto): Promise<unknown> {
    return this.verificationService.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulter une demande de verification' })
  detail(@Param('id') id: string): Promise<unknown> {
    return this.verificationService.getAdminById(id);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prendre une decision sur une demande de verification' })
  decide(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
    @Body() dto: VerificationDecisionDto
  ): Promise<{ id: string; status: string }> {
    return this.verificationService.decide(user!.id, id, dto);
  }
}