import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { FhirService } from './fhir.service';
import type { FhirBundle } from './fhir.types';

@ApiTags('fhir')
@Controller('fhir')
export class FhirController {
  constructor(private readonly fhir: FhirService) {}

  // Export de demonstration : donnees SYNTHETIQUES uniquement. Aucun dossier
  // reel n'est lu ni modifie. L'authentification est requise mais aucune donnee
  // patient n'est exposee.
  @Get('demo/bundle')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Bundle FHIR R4 de demonstration (donnees fictives)' })
  getDemoBundle(): FhirBundle {
    return this.fhir.buildDemoBundle();
  }

  // Auto-export : le patient exporte son propre dossier.
  @Get('me/bundle')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Export FHIR R4 de mon dossier (patient)' })
  getMyBundle(@CurrentUser() user: AuthenticatedUser): Promise<FhirBundle> {
    return this.fhir.exportMyBundle(user!.id);
  }

  // Export professionnel : autorisation STRICTE via RecordAccessService.
  @Get('patients/:patientUserId/bundle')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: "Export FHIR R4 d'un dossier patient (professionnel autorise)" })
  getPatientBundle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string
  ): Promise<FhirBundle> {
    return this.fhir.exportPatientBundle(user!.id, patientUserId);
  }
}
