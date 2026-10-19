import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common';
import { Role } from '@prisma/client';
import {
  ApiConflictResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSpecialtyDto } from './dto/create-specialty.dto';
import { UpdateSpecialtyDto } from './dto/update-specialty.dto';
import { SpecialtiesService, SpecialtyView } from './specialties.service';

@ApiTags('specialties')
@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les specialties actives (referentiel public)' })
  listActive(): Promise<SpecialtyView[]> {
    return this.specialtiesService.listActive();
  }

  @Post()
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer une specialite (administrateur uniquement)' })
  @ApiUnauthorizedResponse({ description: 'Non authentifie' })
  @ApiConflictResponse({ description: 'Code deja utilise' })
  create(@Body() dto: CreateSpecialtyDto): Promise<SpecialtyView> {
    return this.specialtiesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Modifier une specialite (administrateur uniquement)' })
  @ApiUnauthorizedResponse({ description: 'Non authentifie' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSpecialtyDto
  ): Promise<SpecialtyView> {
    return this.specialtiesService.update(id, dto);
  }
}