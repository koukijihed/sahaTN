import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { AffiliationDecisionDto } from './dto/affiliation-decision.dto';
import { FacilityDecisionDto } from './dto/facility-decision.dto';
import { GrantFacilityManagerDto } from './dto/grant-facility-manager.dto';
import { ListFacilitiesAdminQueryDto } from './dto/list-facilities-admin-query.dto';
import {
  FacilityView,
  FacilitiesService
} from './facilities.service';

@ApiTags('admin-facilities')
@ApiUnauthorizedResponse({ description: 'Non authentifie' })
@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('admin')
export class FacilitiesAdminController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get('facilities')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lister les etablissements (administration)' })
  listAdmin(
    @Query() query: ListFacilitiesAdminQueryDto
  ) {
    return this.facilitiesService.listAdmin({
      status: query.status,
      page: query.page ?? 1,
      limit: query.limit ?? 20
    });
  }

  @Get('facilities/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Detail d\'un etablissement (administration)' })
  getAdminById(@Param('id') id: string): Promise<FacilityView> {
    return this.facilitiesService.getAdminById(id);
  }

  @Post('facilities/:id/decision')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decision de verification d\'un etablissement' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FacilityDecisionDto
  ): Promise<{ id: string; status: string }> {
    return this.facilitiesService.decide(user!.id, id, dto);
  }

  @Post('facilities/:id/managers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Nommer un gestionnaire d\'etablissement' })
  grantManager(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GrantFacilityManagerDto
  ) {
    return this.facilitiesService.grantManager(user!.id, id, dto);
  }

  @Delete('facilities/:id/managers/:userId')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retirer un gestionnaire d\'etablissement' })
  removeManager(
    @Param('id') id: string,
    @Param('userId') userId: string
  ): Promise<{ removed: boolean }> {
    return this.facilitiesService.removeManager(id, userId);
  }

  @Post('facility-affiliations/:id/decision')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decision sur une affiliation medecin-etablissement' })
  decideAffiliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AffiliationDecisionDto
  ): Promise<{ id: string; status: string }> {
    return this.facilitiesService.decideAffiliation(user!.id, id, dto);
  }
}