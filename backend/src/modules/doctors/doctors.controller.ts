import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import {
  CredentialView,
  DoctorProfileView,
  DoctorsService,
  PublicDoctorView
} from './doctors.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { ListDoctorsQueryDto } from './dto/list-doctors-query.dto';
import { SetVisibilityDto } from './dto/set-visibility.dto';
import { UpsertDoctorProfileDto } from './dto/upsert-doctor-profile.dto';

@ApiTags('doctors')
@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Recherche publique des medecins verifies et publiquement listes (filtres, tri, pagination)'
  })
  search(@Query() query: ListDoctorsQueryDto) {
    return this.doctorsService.searchPublic(query);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Consulter son propre profil professionnel' })
  async me(
    @CurrentUser() user: AuthenticatedUser | undefined
  ): Promise<{ profile: DoctorProfileView }> {
    const profile = await this.doctorsService.getProfileByUserId(user!.id);
    if (!profile) {
      throw new NotFoundException('Professional profile not found');
    }
    return { profile };
  }

  @Put('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary:
      'Creer ou completer son propre profil professionnel (champs autorises uniquement)'
  })
  async updateMe(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertDoctorProfileDto
  ): Promise<{ profile: DoctorProfileView }> {
    const profile = await this.doctorsService.upsertProfile(user!.id, dto);
    return { profile };
  }

  @Get('me/credentials')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Consulter les metadonnees de ses qualifications professionnelles'
  })
  async credentials(
    @CurrentUser() user: AuthenticatedUser | undefined
  ): Promise<{ credentials: CredentialView[] }> {
    const profile = await this.doctorsService.getProfileByUserId(user!.id);
    if (!profile) {
      throw new NotFoundException('Professional profile not found');
    }
    return { credentials: profile.credentials };
  }

  @Post('me/credentials')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Declarer une qualification professionnelle (metadonnees)' })
  async addCredential(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: CreateCredentialDto
  ): Promise<{ credential: CredentialView }> {
    const credential = await this.doctorsService.addCredential(user!.id, dto);
    return { credential };
  }

  @Put('me/visibility')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary:
      "Action reservee aux medecins verifies : apparaitre ou non dans le repertoire public"
  })
  async visibility(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: SetVisibilityDto
  ): Promise<{ listed: boolean }> {
    await this.doctorsService.setPublicVisibility(user!.id, dto.listed);
    return { listed: dto.listed };
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Profil public d un medecin verifie et listable (sinon impossible de le distinguer)'
  })
  @HttpCode(HttpStatus.OK)
  publicProfile(@Param('id') id: string): Promise<{ profile: PublicDoctorView }> {
    return this.doctorsService.getPublicProfile(id).then((profile) => ({ profile }));
  }
}