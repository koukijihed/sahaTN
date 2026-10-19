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
import {
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { CreateAllergyDto } from './dto/create-allergy.dto';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { CreateObservationDto } from './dto/create-observation.dto';
import { CreateRecordGrantDto } from './dto/create-record-grant.dto';
import { ListAccessEventsQueryDto } from './dto/list-access-events-query.dto';
import { ListPatientObservationsQueryDto } from './dto/list-patient-observations-query.dto';
import { RequestEmergencyAccessDto } from './dto/request-emergency-access.dto';
import { RevokeRecordGrantDto } from './dto/revoke-record-grant.dto';
import {
  ClinicalDiagnosisView,
  ClinicalEncounterCoreView,
  ClinicalEncounterDetailView,
  ClinicalEncounterSummaryView,
  ClinicalObservationView,
  MedicalRecordSummaryView,
  MedicalRecordsService,
  PatientAllergyView
} from './medical-records.service';
import {
  AccessEventView,
  AccessStatusView,
  CareRelationshipView,
  EmergencyAccessView,
  PatientWithAccessView,
  RecordAccessService,
  RecordGrantHistoryItem,
  RecordGrantView
} from './record-access.service';

// ---------------------------------------------------------------- patient

@ApiTags('medical-records')
@Controller('medical-records')
export class PatientMedicalRecordsController {
  constructor(
    private readonly medicalRecords: MedicalRecordsService,
    private readonly recordAccess: RecordAccessService
  ) {}

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Resume de mon dossier medical (patient)' })
  getMyRecordSummary(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<MedicalRecordSummaryView> {
    return this.medicalRecords.getMyRecordSummary(user!.id);
  }

  @Get('me/encounters')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Mes consultations (patient)' })
  listMyEncounters(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ClinicalEncounterSummaryView[]> {
    return this.medicalRecords.listMyEncounters(user!.id);
  }

  @Get('me/encounters/:encounterId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Detail d\'une consultation (patient)' })
  getMyEncounter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('encounterId') encounterId: string
  ): Promise<ClinicalEncounterDetailView> {
    return this.medicalRecords.getMyEncounter(user!.id, encounterId);
  }

  @Get('me/diagnoses')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Mes diagnostics (patient)' })
  listMyDiagnoses(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<ClinicalDiagnosisView[]> {
    return this.medicalRecords.listMyDiagnoses(user!.id);
  }

  @Get('me/allergies')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Mes allergies (patient)' })
  listMyAllergies(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PatientAllergyView[]> {
    return this.medicalRecords.listMyAllergies(user!.id);
  }

  @Get('me/grants')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Autorisations accordees (patient)' })
  listMyGrants(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<RecordGrantView[]> {
    return this.recordAccess.listGrants(user!.id);
  }

  @Post('me/grants')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Accorder une autorisation d\'acces a un professionnel (patient)'
  })
  createMyGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRecordGrantDto
  ): Promise<RecordGrantView> {
    return this.recordAccess.createGrant(user!.id, dto);
  }

  @Get('me/grants/history')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Historique des autorisations (patient)' })
  listMyGrantHistory(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<RecordGrantHistoryItem[]> {
    return this.recordAccess.listGrantHistory(user!.id);
  }

  @Post('me/grants/:grantId/revoke')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoquer une autorisation (patient)' })
  revokeMyGrant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('grantId') grantId: string,
    @Body() dto: RevokeRecordGrantDto
  ): Promise<{ id: string; status: string }> {
    return this.recordAccess.revokeGrant(user!.id, grantId, dto);
  }

  @Get('me/relations')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Relations de soins me concernant (patient)' })
  listMyRelations(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<CareRelationshipView[]> {
    return this.recordAccess.listRelations(user!.id);
  }

  @Post('me/relations/:relationId/end')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mettre fin a une relation de soins (patient)' })
  endMyRelation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('relationId') relationId: string
  ): Promise<CareRelationshipView> {
    return this.recordAccess.endRelation(user!.id, relationId);
  }

  @Get('me/access')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Journal des acces a mon dossier (patient)' })
  listMyAccessEvents(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAccessEventsQueryDto
  ): Promise<AccessEventView[]> {
    return this.recordAccess.listAccessEvents(user!.id, query.limit);
  }

  @Get('me/emergency-access')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Acces d\'urgence a mon dossier (patient)' })
  listMyEmergencyAccess(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<EmergencyAccessView[]> {
    return this.recordAccess.listEmergencyAccess(user!.id);
  }
}

// ------------------------------------------------------------ professional

@ApiTags('medical-records')
@Controller('medical-records/patients')
export class ProfessionalMedicalRecordsController {
  constructor(
    private readonly medicalRecords: MedicalRecordsService,
    private readonly recordAccess: RecordAccessService
  ) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Dossiers auxquels j\'ai acces (praticien)' })
  listPatientsWithAccess(
    @CurrentUser() user: AuthenticatedUser
  ): Promise<PatientWithAccessView[]> {
    return this.recordAccess.patientsWithAccess(user!.id);
  }

  @Get(':patientUserId/access')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Etat de mon acces au dossier d\'un patient (praticien)'
  })
  getAccessStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string
  ): Promise<AccessStatusView> {
    return this.recordAccess.accessStatus(user!.id, patientUserId);
  }

  @Get(':patientUserId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Resume du dossier d\'un patient (praticien)' })
  getPatientSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string
  ): Promise<MedicalRecordSummaryView> {
    return this.medicalRecords.getPatientRecordSummary(user!.id, patientUserId);
  }

  @Get(':patientUserId/encounters')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Consultations d\'un patient (praticien)' })
  listPatientEncounters(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string
  ): Promise<ClinicalEncounterSummaryView[]> {
    return this.medicalRecords.listPatientEncounters(user!.id, patientUserId);
  }

  @Get(':patientUserId/encounters/:encounterId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Detail d\'une consultation d\'un patient (praticien)' })
  getPatientEncounter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Param('encounterId') encounterId: string
  ): Promise<ClinicalEncounterCoreView> {
    return this.medicalRecords.getPatientEncounter(
      user!.id,
      patientUserId,
      encounterId
    );
  }

  @Get(':patientUserId/observations')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Observations d\'un patient (praticien)' })
  listPatientObservations(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Query() query: ListPatientObservationsQueryDto
  ): Promise<ClinicalObservationView[]> {
    return this.medicalRecords.listPatientObservations(
      user!.id,
      patientUserId,
      query.encounterId
    );
  }

  @Get(':patientUserId/diagnoses')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Diagnostics d\'un patient (praticien)' })
  listPatientDiagnoses(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string
  ): Promise<ClinicalDiagnosisView[]> {
    return this.medicalRecords.listPatientDiagnoses(user!.id, patientUserId);
  }

  @Get(':patientUserId/allergies')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Allergies d\'un patient (praticien)' })
  listPatientAllergies(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string
  ): Promise<PatientAllergyView[]> {
    return this.medicalRecords.listPatientAllergies(user!.id, patientUserId);
  }

  @Post(':patientUserId/encounters')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Creer une consultation (praticien, autorisation requise)' })
  createEncounter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Body() dto: CreateEncounterDto
  ): Promise<ClinicalEncounterDetailView> {
    return this.medicalRecords.createEncounter(user!.id, patientUserId, dto);
  }

  @Post(':patientUserId/encounters/:encounterId/observations')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une observation (praticien, autorisation requise)' })
  addObservation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateObservationDto
  ): Promise<ClinicalObservationView> {
    return this.medicalRecords.addObservation(
      user!.id,
      patientUserId,
      encounterId,
      dto
    );
  }

  @Post(':patientUserId/diagnoses')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter un diagnostic (praticien, autorisation requise)' })
  createDiagnosis(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Body() dto: CreateDiagnosisDto
  ): Promise<ClinicalDiagnosisView> {
    return this.medicalRecords.createDiagnosis(user!.id, patientUserId, dto);
  }

  @Post(':patientUserId/allergies')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ajouter une allergie (praticien, autorisation requise)' })
  createAllergy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Body() dto: CreateAllergyDto
  ): Promise<PatientAllergyView> {
    return this.medicalRecords.createAllergy(user!.id, patientUserId, dto);
  }

  @Post(':patientUserId/emergency-access')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Declencher un acces d\'urgence en lecture seule (praticien)'
  })
  requestEmergencyAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientUserId') patientUserId: string,
    @Body() dto: RequestEmergencyAccessDto
  ): Promise<EmergencyAccessView> {
    return this.recordAccess.requestEmergencyAccess(user!.id, patientUserId, dto);
  }
}
