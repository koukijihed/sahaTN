import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  AllergySeverity,
  AllergySource,
  AllergyStatus,
  ClinicalDataCertainty,
  ClinicalDiagnosis,
  ClinicalDiagnosisStatus,
  ClinicalEncounterType,
  ClinicalEntryStatus,
  ClinicalObservation,
  ClinicalObservationCategory,
  MedicalRecordAccessAction,
  MedicalRecordAccessPurpose,
  MedicalRecordStatus,
  PatientAllergy,
  Prisma,
  RecordGrantPermission
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { CreateAllergyDto } from './dto/create-allergy.dto';
import { CreateDiagnosisDto } from './dto/create-diagnosis.dto';
import { CreateEncounterDto } from './dto/create-encounter.dto';
import { CreateObservationDto } from './dto/create-observation.dto';
import {
  DoctorIdentity,
  RecordAccessBasis,
  RecordAccessService
} from './record-access.service';

export interface MedicalRecordSummaryView {
  patientUserId: string;
  recordId: string;
  status: MedicalRecordStatus;
  createdAt: Date;
  updatedAt: Date;
  counts: {
    encounters: number;
    observations: number;
    diagnoses: number;
    allergies: number;
  };
}

export interface ClinicalEncounterSummaryView {
  id: string;
  type: ClinicalEncounterType;
  occurredAt: Date;
  doctor: { id: string; displayName: string };
  facility: { id: string; displayName: string } | null;
  appointmentId: string | null;
  recordStatus: ClinicalEntryStatus;
  createdAt: Date;
}

export interface ClinicalEncounterCoreView extends ClinicalEncounterSummaryView {
  chiefComplaint: string | null;
  notes: string | null;
}

export interface ClinicalObservationView {
  id: string;
  encounterId: string | null;
  category: ClinicalObservationCategory;
  code: string | null;
  label: string;
  valueText: string | null;
  valueNumeric: number | null;
  unit: string | null;
  certainty: ClinicalDataCertainty;
  observedAt: Date;
  recordStatus: ClinicalEntryStatus;
  createdAt: Date;
}

export interface ClinicalDiagnosisView {
  id: string;
  encounterId: string | null;
  code: string | null;
  label: string;
  description: string | null;
  status: ClinicalDiagnosisStatus;
  diagnosedAt: Date;
  recordStatus: ClinicalEntryStatus;
  createdAt: Date;
}

export interface ClinicalEncounterDetailView extends ClinicalEncounterCoreView {
  observations: ClinicalObservationView[];
  diagnoses: ClinicalDiagnosisView[];
}

export interface PatientAllergyView {
  id: string;
  allergen: string;
  reaction: string | null;
  severity: AllergySeverity | null;
  source: AllergySource;
  certainty: ClinicalDataCertainty;
  status: AllergyStatus;
  recordStatus: ClinicalEntryStatus;
  recordedAt: Date;
  createdAt: Date;
}

const ENCOUNTER_SUMMARY_SELECT = {
  id: true,
  type: true,
  occurredAt: true,
  chiefComplaint: true,
  notes: true,
  appointmentId: true,
  recordStatus: true,
  createdAt: true,
  doctorProfile: { select: { id: true, displayName: true } },
  facility: { select: { id: true, displayName: true } }
} satisfies Prisma.ClinicalEncounterSelect;

type EncounterSummaryPayload = Prisma.ClinicalEncounterGetPayload<{
  select: typeof ENCOUNTER_SUMMARY_SELECT;
}>;

const ENCOUNTER_DETAIL_INCLUDE = {
  doctorProfile: { select: { id: true, displayName: true } },
  facility: { select: { id: true, displayName: true } },
  observations: { orderBy: { observedAt: 'asc' as const } },
  diagnoses: { orderBy: { diagnosedAt: 'asc' as const } }
} satisfies Prisma.ClinicalEncounterInclude;

type EncounterDetailPayload = Prisma.ClinicalEncounterGetPayload<{
  include: typeof ENCOUNTER_DETAIL_INCLUDE;
}>;

// Service clinique du dossier medical. Le filtrage, la tracabilite et la
// decision d'autorisation sont delegues au RecordAccessService : le role
// DOCTOR, l'affiliation ou un rendez-vous passe ne suffisent jamais. Chaque
// lecture/ecriture exige une autorisation explicite (ou un acces d'urgence en
// lecture seule pour les lectures).
@Injectable()
export class MedicalRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly recordAccess: RecordAccessService
  ) {}

  // --------------------------------------------------------------- patient

  async getMyRecordSummary(userId: string): Promise<MedicalRecordSummaryView> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    await this.logSelfRead(record.id, userId);
    return this.toSummary(userId, record);
  }

  async listMyEncounters(userId: string): Promise<ClinicalEncounterSummaryView[]> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    const encounters = await this.prisma.clinicalEncounter.findMany({
      where: { medicalRecordId: record.id },
      select: ENCOUNTER_SUMMARY_SELECT,
      orderBy: { occurredAt: 'desc' }
    });
    await this.logSelfRead(record.id, userId);
    return encounters.map((encounter) => this.toEncounterSummary(encounter));
  }

  async getMyEncounter(
    userId: string,
    encounterId: string
  ): Promise<ClinicalEncounterDetailView> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    const encounter = await this.prisma.clinicalEncounter.findFirst({
      where: { id: encounterId, medicalRecordId: record.id },
      include: ENCOUNTER_DETAIL_INCLUDE
    });
    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }
    await this.logSelfRead(record.id, userId, 'ClinicalEncounter', encounter.id);
    return this.toEncounterDetail(encounter);
  }

  async listMyDiagnoses(userId: string): Promise<ClinicalDiagnosisView[]> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    const diagnoses = await this.prisma.clinicalDiagnosis.findMany({
      where: { medicalRecordId: record.id },
      orderBy: { diagnosedAt: 'desc' }
    });
    await this.logSelfRead(record.id, userId);
    return diagnoses.map((diagnosis) => this.toDiagnosisView(diagnosis));
  }

  async listMyAllergies(userId: string): Promise<PatientAllergyView[]> {
    const record = await this.recordAccess.ensurePatientRecord(userId, userId);
    const allergies = await this.prisma.patientAllergy.findMany({
      where: { medicalRecordId: record.id },
      orderBy: { recordedAt: 'desc' }
    });
    await this.logSelfRead(record.id, userId);
    return allergies.map((allergy) => this.toAllergyView(allergy));
  }

  // --------------------------------------------------------------- doctor

  async getPatientRecordSummary(
    doctorUserId: string,
    patientUserId: string
  ): Promise<MedicalRecordSummaryView> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_RECORD
    );
    await this.logDoctorRead(authorized, doctorUserId);
    return this.toSummary(patientUserId, authorized.record);
  }

  async listPatientEncounters(
    doctorUserId: string,
    patientUserId: string
  ): Promise<ClinicalEncounterSummaryView[]> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_ENCOUNTERS
    );
    const encounters = await this.prisma.clinicalEncounter.findMany({
      where: { medicalRecordId: authorized.record.id },
      select: ENCOUNTER_SUMMARY_SELECT,
      orderBy: { occurredAt: 'desc' }
    });
    await this.logDoctorRead(authorized, doctorUserId);
    return encounters.map((encounter) => this.toEncounterSummary(encounter));
  }

  // Detail d'une consultation : uniquement le contenu coeur de la consultation.
  // Les observations et diagnostics sont exposes par des lectures distinctes,
  // soumises a leurs propres portees.
  async getPatientEncounter(
    doctorUserId: string,
    patientUserId: string,
    encounterId: string
  ): Promise<ClinicalEncounterCoreView> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_ENCOUNTERS
    );
    const encounter = await this.prisma.clinicalEncounter.findFirst({
      where: { id: encounterId, medicalRecordId: authorized.record.id },
      select: ENCOUNTER_SUMMARY_SELECT
    });
    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }
    await this.logDoctorRead(
      authorized,
      doctorUserId,
      'ClinicalEncounter',
      encounter.id
    );
    return this.toEncounterCore(encounter);
  }

  async listPatientObservations(
    doctorUserId: string,
    patientUserId: string,
    encounterId?: string
  ): Promise<ClinicalObservationView[]> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_OBSERVATIONS
    );
    const observations = await this.prisma.clinicalObservation.findMany({
      where: {
        medicalRecordId: authorized.record.id,
        ...(encounterId ? { encounterId } : {})
      },
      orderBy: { observedAt: 'desc' }
    });
    await this.logDoctorRead(authorized, doctorUserId);
    return observations.map((observation) => this.toObservationView(observation));
  }

  async listPatientDiagnoses(
    doctorUserId: string,
    patientUserId: string
  ): Promise<ClinicalDiagnosisView[]> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_DIAGNOSES
    );
    const diagnoses = await this.prisma.clinicalDiagnosis.findMany({
      where: { medicalRecordId: authorized.record.id },
      orderBy: { diagnosedAt: 'desc' }
    });
    await this.logDoctorRead(authorized, doctorUserId);
    return diagnoses.map((diagnosis) => this.toDiagnosisView(diagnosis));
  }

  async listPatientAllergies(
    doctorUserId: string,
    patientUserId: string
  ): Promise<PatientAllergyView[]> {
    const authorized = await this.recordAccess.authorizeRead(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.VIEW_ALLERGIES
    );
    const allergies = await this.prisma.patientAllergy.findMany({
      where: { medicalRecordId: authorized.record.id },
      orderBy: { recordedAt: 'desc' }
    });
    await this.logDoctorRead(authorized, doctorUserId);
    return allergies.map((allergy) => this.toAllergyView(allergy));
  }

  // ---------------------------------------------------------------- write

  async createEncounter(
    doctorUserId: string,
    patientUserId: string,
    dto: CreateEncounterDto
  ): Promise<ClinicalEncounterDetailView> {
    const authorized = await this.recordAccess.authorizeWrite(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.WRITE_ENCOUNTERS
    );

    let facilityId: string | null = null;
    if (dto.appointmentId) {
      const linked = await this.appointments.isCareAppointment(
        doctorUserId,
        patientUserId,
        dto.appointmentId
      );
      if (!linked) {
        throw new BadRequestException(
          'The appointment is not a confirmed care visit with this patient'
        );
      }
      facilityId = await this.facilityIdOfAppointment(dto.appointmentId);
    }

    const encounter = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalEncounter.create({
        data: {
          medicalRecordId: authorized.record.id,
          doctorProfileId: authorized.profile.id,
          facilityId,
          appointmentId: dto.appointmentId ?? null,
          type: dto.type ?? ClinicalEncounterType.CONSULTATION,
          occurredAt: new Date(dto.occurredAt),
          chiefComplaint: dto.chiefComplaint?.trim() || null,
          notes: dto.notes?.trim() || null
        }
      });
      await tx.medicalRecordAccessEvent.create({
        data: {
          medicalRecordId: authorized.record.id,
          actorUserId: doctorUserId,
          actorDoctorProfileId: authorized.profile.id,
          action: MedicalRecordAccessAction.ENCOUNTER_CREATED,
          purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
          targetType: 'ClinicalEncounter',
          targetId: created.id
        }
      });
      return tx.clinicalEncounter.findUniqueOrThrow({
        where: { id: created.id },
        include: ENCOUNTER_DETAIL_INCLUDE
      });
    });

    return this.toEncounterDetail(encounter);
  }

  async addObservation(
    doctorUserId: string,
    patientUserId: string,
    encounterId: string,
    dto: CreateObservationDto
  ): Promise<ClinicalObservationView> {
    const authorized = await this.recordAccess.authorizeWrite(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.WRITE_OBSERVATIONS
    );
    const encounter = await this.prisma.clinicalEncounter.findFirst({
      where: { id: encounterId, medicalRecordId: authorized.record.id },
      select: { id: true }
    });
    if (!encounter) {
      throw new NotFoundException('Encounter not found');
    }

    const observation = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalObservation.create({
        data: {
          medicalRecordId: authorized.record.id,
          encounterId: encounter.id,
          doctorProfileId: authorized.profile.id,
          category: dto.category,
          code: dto.code?.trim() || null,
          label: dto.label.trim(),
          valueText: dto.valueText?.trim() || null,
          valueNumeric: dto.valueNumeric ?? null,
          unit: dto.unit?.trim() || null,
          certainty: dto.certainty ?? ClinicalDataCertainty.KNOWN,
          observedAt: new Date(dto.observedAt)
        }
      });
      await tx.medicalRecordAccessEvent.create({
        data: {
          medicalRecordId: authorized.record.id,
          actorUserId: doctorUserId,
          actorDoctorProfileId: authorized.profile.id,
          action: MedicalRecordAccessAction.OBSERVATION_CREATED,
          purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
          targetType: 'ClinicalObservation',
          targetId: created.id
        }
      });
      return created;
    });

    return this.toObservationView(observation);
  }

  async createDiagnosis(
    doctorUserId: string,
    patientUserId: string,
    dto: CreateDiagnosisDto
  ): Promise<ClinicalDiagnosisView> {
    const authorized = await this.recordAccess.authorizeWrite(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.WRITE_DIAGNOSES
    );

    const encounterId: string | null = dto.encounterId ?? null;
    if (encounterId) {
      const belongs = await this.prisma.clinicalEncounter.findFirst({
        where: { id: encounterId, medicalRecordId: authorized.record.id },
        select: { id: true }
      });
      if (!belongs) {
        throw new BadRequestException(
          'The encounter does not belong to this patient\'s record'
        );
      }
    }

    const diagnosis = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clinicalDiagnosis.create({
        data: {
          medicalRecordId: authorized.record.id,
          encounterId,
          doctorProfileId: authorized.profile.id,
          code: dto.code?.trim() || null,
          label: dto.label.trim(),
          description: dto.description?.trim() || null,
          status: dto.status ?? ClinicalDiagnosisStatus.PROVISIONAL,
          diagnosedAt: new Date(dto.diagnosedAt)
        }
      });
      await tx.medicalRecordAccessEvent.create({
        data: {
          medicalRecordId: authorized.record.id,
          actorUserId: doctorUserId,
          actorDoctorProfileId: authorized.profile.id,
          action: MedicalRecordAccessAction.DIAGNOSIS_CREATED,
          purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
          targetType: 'ClinicalDiagnosis',
          targetId: created.id
        }
      });
      return created;
    });

    return this.toDiagnosisView(diagnosis);
  }

  async createAllergy(
    doctorUserId: string,
    patientUserId: string,
    dto: CreateAllergyDto
  ): Promise<PatientAllergyView> {
    const authorized = await this.recordAccess.authorizeWrite(
      doctorUserId,
      patientUserId,
      RecordGrantPermission.WRITE_ALLERGIES
    );

    const allergy = await this.prisma.$transaction(async (tx) => {
      const created = await tx.patientAllergy.create({
        data: {
          medicalRecordId: authorized.record.id,
          doctorProfileId: authorized.profile.id,
          allergen: dto.allergen.trim(),
          reaction: dto.reaction?.trim() || null,
          severity: dto.severity ?? null,
          source: dto.source ?? AllergySource.PROFESSIONAL_DOCUMENTED,
          certainty: dto.certainty ?? ClinicalDataCertainty.KNOWN,
          status: dto.status ?? AllergyStatus.ACTIVE,
          recordedAt: new Date(dto.recordedAt)
        }
      });
      await tx.medicalRecordAccessEvent.create({
        data: {
          medicalRecordId: authorized.record.id,
          actorUserId: doctorUserId,
          actorDoctorProfileId: authorized.profile.id,
          action: MedicalRecordAccessAction.ALLERGY_CREATED,
          purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
          targetType: 'PatientAllergy',
          targetId: created.id
        }
      });
      return created;
    });

    return this.toAllergyView(allergy);
  }

  // ---------------------------------------------------------------- audit

  private logSelfRead(
    medicalRecordId: string,
    userId: string,
    targetType?: string,
    targetId?: string
  ): Promise<void> {
    return this.recordAccess.logAccess(medicalRecordId, {
      actorUserId: userId,
      actorDoctorProfileId: null,
      action: MedicalRecordAccessAction.RECORD_VIEWED,
      purpose: MedicalRecordAccessPurpose.PATIENT_SELF,
      targetType: targetType ?? null,
      targetId: targetId ?? null
    });
  }

  private logDoctorRead(
    authorized: { record: { id: string }; profile: DoctorIdentity; basis: RecordAccessBasis },
    doctorUserId: string,
    targetType?: string,
    targetId?: string
  ): Promise<void> {
    return this.recordAccess.logAccess(authorized.record.id, {
      actorUserId: doctorUserId,
      actorDoctorProfileId: authorized.profile.id,
      action: MedicalRecordAccessAction.RECORD_VIEWED,
      purpose:
        authorized.basis === 'EMERGENCY'
          ? MedicalRecordAccessPurpose.EMERGENCY
          : MedicalRecordAccessPurpose.EXPLICIT_GRANT,
      targetType: targetType ?? null,
      targetId: targetId ?? null
    });
  }

  // ---------------------------------------------------------------- helpers

  private async facilityIdOfAppointment(appointmentId: string): Promise<string | null> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        slot: {
          select: {
            schedule: {
              select: {
                affiliation: { select: { facilityId: true } }
              }
            }
          }
        }
      }
    });
    return appointment?.slot.schedule.affiliation.facilityId ?? null;
  }

  private async toSummary(
    patientUserId: string,
    record: { id: string; status: MedicalRecordStatus; createdAt: Date; updatedAt: Date }
  ): Promise<MedicalRecordSummaryView> {
    const [encounters, observations, diagnoses, allergies] = await Promise.all([
      this.prisma.clinicalEncounter.count({ where: { medicalRecordId: record.id } }),
      this.prisma.clinicalObservation.count({ where: { medicalRecordId: record.id } }),
      this.prisma.clinicalDiagnosis.count({ where: { medicalRecordId: record.id } }),
      this.prisma.patientAllergy.count({ where: { medicalRecordId: record.id } })
    ]);
    return {
      patientUserId,
      recordId: record.id,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      counts: { encounters, observations, diagnoses, allergies }
    };
  }

  private toEncounterSummary(
    encounter: EncounterSummaryPayload
  ): ClinicalEncounterSummaryView {
    return {
      id: encounter.id,
      type: encounter.type,
      occurredAt: encounter.occurredAt,
      doctor: encounter.doctorProfile,
      facility: encounter.facility,
      appointmentId: encounter.appointmentId,
      recordStatus: encounter.recordStatus,
      createdAt: encounter.createdAt
    };
  }

  private toEncounterCore(encounter: EncounterSummaryPayload): ClinicalEncounterCoreView {
    return {
      ...this.toEncounterSummary(encounter),
      chiefComplaint: encounter.chiefComplaint,
      notes: encounter.notes
    };
  }

  private toEncounterDetail(encounter: EncounterDetailPayload): ClinicalEncounterDetailView {
    return {
      ...this.toEncounterCore(encounter),
      observations: encounter.observations.map((observation) =>
        this.toObservationView(observation)
      ),
      diagnoses: encounter.diagnoses.map((diagnosis) =>
        this.toDiagnosisView(diagnosis)
      )
    };
  }

  private toObservationView(
    observation: ClinicalObservation
  ): ClinicalObservationView {
    return {
      id: observation.id,
      encounterId: observation.encounterId,
      category: observation.category,
      code: observation.code,
      label: observation.label,
      valueText: observation.valueText,
      valueNumeric: observation.valueNumeric,
      unit: observation.unit,
      certainty: observation.certainty,
      observedAt: observation.observedAt,
      recordStatus: observation.recordStatus,
      createdAt: observation.createdAt
    };
  }

  private toDiagnosisView(
    diagnosis: ClinicalDiagnosis
  ): ClinicalDiagnosisView {
    return {
      id: diagnosis.id,
      encounterId: diagnosis.encounterId,
      code: diagnosis.code,
      label: diagnosis.label,
      description: diagnosis.description,
      status: diagnosis.status,
      diagnosedAt: diagnosis.diagnosedAt,
      recordStatus: diagnosis.recordStatus,
      createdAt: diagnosis.createdAt
    };
  }

  private toAllergyView(allergy: PatientAllergy): PatientAllergyView {
    return {
      id: allergy.id,
      allergen: allergy.allergen,
      reaction: allergy.reaction,
      severity: allergy.severity,
      source: allergy.source,
      certainty: allergy.certainty,
      status: allergy.status,
      recordStatus: allergy.recordStatus,
      recordedAt: allergy.recordedAt,
      createdAt: allergy.createdAt
    };
  }
}
