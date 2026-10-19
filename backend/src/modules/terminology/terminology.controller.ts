import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ObservationDefinition,
  UnitDefinition
} from './terminology.constants';
import {
  ObservationCatalogueView,
  TerminologyService
} from './terminology.service';

@ApiTags('terminology')
@Controller('terminology')
export class TerminologyController {
  constructor(private readonly terminologyService: TerminologyService) {}

  @Get('vital-signs')
  @ApiOperation({
    summary: 'Referentiel interne des signes vitaux (public)'
  })
  listVitalSigns(): readonly ObservationDefinition[] {
    return this.terminologyService.getVitalSigns();
  }

  @Get('units')
  @ApiOperation({ summary: 'Sous-ensemble UCUM des unites (public)' })
  listUnits(): readonly UnitDefinition[] {
    return this.terminologyService.getUnits();
  }

  @Get('observations')
  @ApiOperation({ summary: 'Catalogue des observations (public)' })
  getObservationCatalogue(): ObservationCatalogueView {
    return this.terminologyService.getObservationCatalogue();
  }
}
