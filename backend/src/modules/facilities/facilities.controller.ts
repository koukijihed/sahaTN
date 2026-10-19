import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { ListFacilitiesQueryDto } from './dto/list-facilities-query.dto';
import { SubmitFacilityVerificationDto } from './dto/submit-facility-verification.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import {
  AffiliationView,
  FacilitiesService,
  FacilityListItemView,
  FacilityRequestView,
  FacilityView,
  PublicFacilityView
} from './facilities.service';

@ApiTags('facilities')
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Annuaire public des etablissements verifies' })
  listPublic(
    @Query() query: ListFacilitiesQueryDto
  ): Promise<{
    items: FacilityListItemView[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.facilitiesService.listPublic(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detail public d\'un etablissement verifie' })
  @ApiNotFoundResponse({ description: 'Etablissement inconnu ou non public' })
  getPublicById(@Param('id') id: string): Promise<PublicFacilityView> {
    return this.facilitiesService.getPublicById(id);
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer un etablissement (espace de gestion)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFacilityDto
  ): Promise<FacilityView> {
    return this.facilitiesService.create(user!.id, dto);
  }

  @Get(':id/manage')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Vue de gestion d\'un etablissement (gestionnaire)' })
  getManage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string
  ): Promise<FacilityView> {
    return this.facilitiesService.getManageById(user!.id, id);
  }

  @Put(':id/manage')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Modifier un etablissement (gestionnaire)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateFacilityDto
  ): Promise<FacilityView> {
    return this.facilitiesService.update(user!.id, id, dto);
  }

  @Post(':id/verification')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Creer ou soumettre une demande de verification' })
  createOrSubmitVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitFacilityVerificationDto
  ): Promise<FacilityRequestView> {
    return this.facilitiesService.createOrSubmitVerification(
      user!.id,
      id,
      dto.submit ?? true
    );
  }

  @Post(':id/affiliations')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Demander une affiliation avec un etablissement' })
  requestAffiliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string
  ): Promise<AffiliationView> {
    return this.facilitiesService.requestAffiliation(user!.id, id);
  }

  @Delete(':id/affiliations/:affiliationId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Mettre fin a une affiliation active' })
  endAffiliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('affiliationId') affiliationId: string
  ): Promise<{ id: string; status: string }> {
    return this.facilitiesService.endAffiliation(user!.id, id, affiliationId);
  }
}

@ApiTags('facilities')
@Controller('doctors')
export class DoctorAffiliationsController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Get('me/affiliations')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Affiliations du medecin courant' })
  listMyAffiliations(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<AffiliationView[]> {
    return this.facilitiesService.listMyAffiliations(user!.id);
  }
}