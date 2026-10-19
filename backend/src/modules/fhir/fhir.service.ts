import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  MedicalRecordAccessAction,
  MedicalRecordAccessPurpose,
  Prisma,
  RecordGrantPermission
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RECORD_ACCESS_DENIED_MESSAGE,
  RecordAccessBasis,
  RecordAccessService
} from '../medical-records/record-access.service';
import { buildDemoSource, DEMO_BUNDLE_ID, DEMO_BUNDLE_TIMESTAMP } from './demo/demo-data';
import type { FhirBundle } from './fhir.types';
import type {
  AllergyIntoleranceSource,
  ConditionSource,
  DocumentSource,
  EncounterSource,
  FhirExportSource,
  ObservationSource,
  OrganizationSource,
  PatientSource,
  PractitionerSource
} from './fhir.sources';
import {
  INTEROPERABILITY_ADAPTER,
  InteroperabilityAdapter
} from './interoperability.port';

interface ExportSections {
  encounters: boolean;
  observations: boolean;
  conditions: boolean;
  allergies: boolean;
  documents: boolean;
}

const ALL_SECTIONS: ExportSections = {
  encounters: true,
  observations: true,
  conditions: true,
  allergies: true,
  documents: true
};

const ENCOUNTER_SELECT = {
  id: true,
  type: true,
  occurredAt: true,
  doctorProfileId: true,
  facilityId: true,
  appointmentId: true,
  chiefComplaint: true,
  notes: true,
  recordStatus: true
} satisfies Prisma.ClinicalEncounterSelect;

const OBSERVATION_SELECT = {
  id: true,
  encounterId: true,
  category: true,
  code: true,
  label: true,
  valueText: true,
  valueNumeric: true,
  unit: true,
  certainty: true,
  observedAt: true,
  doctorProfileId: true,
  recordStatus: true
} satisfies Prisma.ClinicalObservationSelect;

const DIAGNOSIS_SELECT = {
  id: true,
  encounterId: true,
  code: true,
  label: true,
  description: true,
  status: true,
  diagnosedAt: true,
  doctorProfileId: true,
  recordStatus: true
} satisfies Prisma.ClinicalDiagnosisSelect;

const ALLERGY_SELECT = {
  id: true,
  allergen: true,
  reaction: true,
  severity: true,
  source: true,
  certainty: true,
  status: true,
  recordedAt: true,
  doctorProfileId: true,
  recordStatus: true
} satisfies Prisma.PatientAllergySelect;

const DOCUMENT_SELECT = {
  id: true,
  category: true,
  originalName: true,
  declaredMimeType: true,
  detectedMimeType: true,
  sizeBytes: true,
  status: true,
  encounterId: true,
  createdAt: true,
  uploadedByUserId: true,
  uploaderDoctorProfileId: true
} satisfies Prisma.MedicalDocumentSelect;

// Service d'export FHIR. Il produit des Bundles a partir de :
// - un jeu de donnees SYNTHETIQUES (demonstration, deterministe) ;
// - le dossier du patient authentifie (auto-export) ;
// - le dossier d'un patient, apres autorisation STRICTE via RecordAccessService
//   (aucun contournement ; les sections sans permission sont omises).
//
// Il ne realise aucune transmission reseau et n'expose que des metadonnees de
// document (jamais la cle de stockage ni le contenu binaire).
@Injectable()
export class FhirService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recordAccess: RecordAccessService,
    @Inject(INTEROPERABILITY_ADAPTER)
    private readonly adapter: InteroperabilityAdapter
  ) {}

  get fhirVersion(): string {
    return this.adapter.fhirVersion;
  }

  // ------------------------------------------------------------- demo export

  // Export de demonstration : donnees fictives, aucune lecture de base.
  buildDemoBundle(): FhirBundle {
    return this.adapter.buildBundle(buildDemoSource(), {
      id: DEMO_BUNDLE_ID,
      generatedAt: DEMO_BUNDLE_TIMESTAMP
    });
  }

  // --------------------------------------------------------- patient export

  async exportMyBundle(userId: string): Promise<FhirBundle> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    await this.recordAccess.logAccess(record.id, {
      actorUserId: userId,
      actorDoctorProfileId: null,
      action: MedicalRecordAccessAction.RECORD_VIEWED,
      purpose: MedicalRecordAccessPurpose.PATIENT_SELF,
      targetType: 'FhirExport'
    });
    const source = await this.gatherSource(
      record.id,
      userId,
      ALL_SECTIONS
    );
    return this.adapter.buildBundle(source, { generatedAt: new Date() });
  }

  // --------------------------------------------------- professional export

  async exportPatientBundle(
    doctorUserId: string,
    patientUserId: string
  ): Promise<FhirBundle> {
    // Le statut sert UNIQUEMENT a determiner les sections autorisees. La
    // decision d'acces (et le refus, journalise) est prise par `authorizeRead` :
    // un refus est donc audite comme partout ailleurs (ACCESS_DENIED).
    const status = await this.recordAccess.accessStatus(
      doctorUserId,
      patientUserId
    );
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      this.pickReadPermission(status.permissions)
    );

    const sections = this.sectionsFromStatus(status);
    const source = await this.gatherSource(
      authorized.record.id,
      patientUserId,
      sections
    );

    await this.recordAccess.logAccess(authorized.record.id, {
      actorUserId: doctorUserId,
      actorDoctorProfileId: authorized.profile.id,
      action: MedicalRecordAccessAction.RECORD_VIEWED,
      purpose: this.purposeFor(authorized.basis),
      targetType: 'FhirExport'
    });

    return this.adapter.buildBundle(source, { generatedAt: new Date() });
  }

  // ------------------------------------------------------------------ internals

  private pickReadPermission(
    permissions: RecordGrantPermission[]
  ): RecordGrantPermission {
    if (permissions.includes(RecordGrantPermission.VIEW_RECORD)) {
      return RecordGrantPermission.VIEW_RECORD;
    }
    const first = permissions.find((permission) =>
      permission.startsWith('VIEW_')
    );
    // En l'absence de permission explicite, l'acces de lecture repose sur
    // l'acces d'urgence (lecture seule) : VIEW_RECORD est alors accepte par le
    // moteur via le repli d'urgence.
    return first ?? RecordGrantPermission.VIEW_RECORD;
  }

  private sectionsFromStatus(status: {
    permissions: RecordGrantPermission[];
    emergencyActive: boolean;
  }): ExportSections {
    if (status.emergencyActive) {
      return ALL_SECTIONS;
    }
    const has = (permission: RecordGrantPermission): boolean =>
      status.permissions.includes(permission);
    return {
      encounters: has(RecordGrantPermission.VIEW_ENCOUNTERS),
      observations: has(RecordGrantPermission.VIEW_OBSERVATIONS),
      conditions: has(RecordGrantPermission.VIEW_DIAGNOSES),
      allergies: has(RecordGrantPermission.VIEW_ALLERGIES),
      documents: has(RecordGrantPermission.VIEW_DOCUMENTS)
    };
  }

  private purposeFor(basis: RecordAccessBasis): MedicalRecordAccessPurpose {
    return basis === 'EMERGENCY'
      ? MedicalRecordAccessPurpose.EMERGENCY
      : MedicalRecordAccessPurpose.EXPLICIT_GRANT;
  }

  private async gatherSource(
    recordId: string,
    patientUserId: string,
    sections: ExportSections
  ): Promise<FhirExportSource> {
    const patient = await this.loadPatient(patientUserId);

    const encounters = sections.encounters
      ? await this.prisma.clinicalEncounter.findMany({
          where: { medicalRecordId: recordId },
          select: ENCOUNTER_SELECT,
          orderBy: { occurredAt: 'asc' }
        })
      : [];
    const observations = sections.observations
      ? await this.prisma.clinicalObservation.findMany({
          where: { medicalRecordId: recordId },
          select: OBSERVATION_SELECT,
          orderBy: { observedAt: 'asc' }
        })
      : [];
    const diagnoses = sections.conditions
      ? await this.prisma.clinicalDiagnosis.findMany({
          where: { medicalRecordId: recordId },
          select: DIAGNOSIS_SELECT,
          orderBy: { diagnosedAt: 'asc' }
        })
      : [];
    const allergies = sections.allergies
      ? await this.prisma.patientAllergy.findMany({
          where: { medicalRecordId: recordId },
          select: ALLERGY_SELECT,
          orderBy: { recordedAt: 'asc' }
        })
      : [];
    const documents = sections.documents
      ? await this.prisma.medicalDocument.findMany({
          where: { medicalRecordId: recordId },
          select: DOCUMENT_SELECT,
          orderBy: { createdAt: 'asc' }
        })
      : [];

    const doctorIds = new Set<string>();
    encounters.forEach((row) => doctorIds.add(row.doctorProfileId));
    observations.forEach((row) => doctorIds.add(row.doctorProfileId));
    diagnoses.forEach((row) => doctorIds.add(row.doctorProfileId));
    allergies.forEach((row) => doctorIds.add(row.doctorProfileId));
    documents.forEach((row) => {
      if (row.uploaderDoctorProfileId) {
        doctorIds.add(row.uploaderDoctorProfileId);
      }
    });

    const facilityIds = new Set<string>();
    encounters.forEach((row) => {
      if (row.facilityId) {
        facilityIds.add(row.facilityId);
      }
    });

    const practitioners = await this.loadPractitioners(Array.from(doctorIds));
    const organizations = await this.loadOrganizations(
      Array.from(facilityIds)
    );

    // Une ressource ne doit JAMAIS referencer une ressource absente du Bundle.
    // Si la section "consultations" n'est pas autorisee, les liens
    // `encounter` des observations/diagnostics/documents sont omis (ils
    // pointeraient vers un Encounter non inclus). Cela evite d'elargir
    // silencieusement l'acces et de produire des references pendantes.
    const encountersIncluded = sections.encounters;
    const observationsSource = observations.map((row) => {
      const source = this.toObservationSource(row);
      if (!encountersIncluded) {
        source.encounterId = null;
      }
      return source;
    });
    const conditionsSource = diagnoses.map((row) => {
      const source = this.toConditionSource(row);
      if (!encountersIncluded) {
        source.encounterId = null;
      }
      return source;
    });
    const documentsSource = documents.map((row) => {
      const source = this.toDocumentSource(row);
      if (!encountersIncluded) {
        source.encounterId = null;
      }
      return source;
    });

    return {
      patient,
      practitioners,
      organizations,
      encounters: encounters.map((row) => this.toEncounterSource(row)),
      observations: observationsSource,
      conditions: conditionsSource,
      allergies: allergies.map((row) => this.toAllergySource(row)),
      documents: documentsSource
    };
  }

  private async loadPatient(patientUserId: string): Promise<PatientSource> {
    const user = await this.prisma.user.findUnique({
      where: { id: patientUserId },
      select: { id: true, status: true, email: true, phone: true }
    });
    if (!user) {
      throw new ForbiddenException(RECORD_ACCESS_DENIED_MESSAGE);
    }
    return {
      id: user.id,
      active: user.status === 'ACTIVE',
      email: user.email,
      phone: user.phone
    };
  }

  private async loadPractitioners(
    ids: string[]
  ): Promise<PractitionerSource[]> {
    if (ids.length === 0) {
      return [];
    }
    const doctors = await this.prisma.doctorProfile.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        displayName: true,
        languages: true,
        verificationStatus: true,
        specialties: { select: { specialty: { select: { labelFr: true } } } }
      }
    });
    return doctors.map((doctor) => ({
      id: doctor.id,
      displayName: doctor.displayName,
      languages: doctor.languages,
      specialtyLabels: doctor.specialties.map((entry) => entry.specialty.labelFr),
      verificationStatus: doctor.verificationStatus
    }));
  }

  private async loadOrganizations(ids: string[]): Promise<OrganizationSource[]> {
    if (ids.length === 0) {
      return [];
    }
    const facilities = await this.prisma.healthcareFacility.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        displayName: true,
        officialName: true,
        description: true,
        addressLine: true,
        city: true,
        governorate: true,
        delegation: true,
        postalCode: true,
        phone: true,
        websiteUrl: true,
        licenseReference: true,
        verificationStatus: true
      }
    });
    return facilities.map((facility) => ({
      id: facility.id,
      displayName: facility.displayName,
      officialName: facility.officialName,
      description: facility.description,
      addressLine: facility.addressLine,
      city: facility.city,
      governorate: facility.governorate,
      delegation: facility.delegation,
      postalCode: facility.postalCode,
      phone: facility.phone,
      websiteUrl: facility.websiteUrl,
      licenseReference: facility.licenseReference,
      verificationStatus: facility.verificationStatus
    }));
  }

  private toEncounterSource(
    row: Prisma.ClinicalEncounterGetPayload<{ select: typeof ENCOUNTER_SELECT }>
  ): EncounterSource {
    return {
      id: row.id,
      type: row.type,
      occurredAt: row.occurredAt,
      doctorProfileId: row.doctorProfileId,
      facilityId: row.facilityId,
      appointmentId: row.appointmentId,
      chiefComplaint: row.chiefComplaint,
      notes: row.notes,
      recordStatus: row.recordStatus
    };
  }

  private toObservationSource(
    row: Prisma.ClinicalObservationGetPayload<{ select: typeof OBSERVATION_SELECT }>
  ): ObservationSource {
    return {
      id: row.id,
      encounterId: row.encounterId,
      category: row.category,
      code: row.code,
      label: row.label,
      valueText: row.valueText,
      valueNumeric: row.valueNumeric,
      unit: row.unit,
      certainty: row.certainty,
      observedAt: row.observedAt,
      doctorProfileId: row.doctorProfileId,
      recordStatus: row.recordStatus
    };
  }

  private toConditionSource(
    row: Prisma.ClinicalDiagnosisGetPayload<{ select: typeof DIAGNOSIS_SELECT }>
  ): ConditionSource {
    return {
      id: row.id,
      encounterId: row.encounterId,
      code: row.code,
      label: row.label,
      description: row.description,
      status: row.status,
      diagnosedAt: row.diagnosedAt,
      doctorProfileId: row.doctorProfileId,
      recordStatus: row.recordStatus
    };
  }

  private toAllergySource(
    row: Prisma.PatientAllergyGetPayload<{ select: typeof ALLERGY_SELECT }>
  ): AllergyIntoleranceSource {
    return {
      id: row.id,
      allergen: row.allergen,
      reaction: row.reaction,
      severity: row.severity,
      source: row.source,
      certainty: row.certainty,
      status: row.status,
      recordedAt: row.recordedAt,
      doctorProfileId: row.doctorProfileId,
      recordStatus: row.recordStatus
    };
  }

  private toDocumentSource(
    row: Prisma.MedicalDocumentGetPayload<{ select: typeof DOCUMENT_SELECT }>
  ): DocumentSource {
    return {
      id: row.id,
      category: row.category,
      originalName: row.originalName,
      mimeType: row.detectedMimeType || row.declaredMimeType,
      sizeBytes: row.sizeBytes,
      status: row.status,
      encounterId: row.encounterId,
      createdAt: row.createdAt,
      uploadedByUserId: row.uploadedByUserId,
      uploaderDoctorProfileId: row.uploaderDoctorProfileId
    };
  }
}
