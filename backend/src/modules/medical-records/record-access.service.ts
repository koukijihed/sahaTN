import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import {
  CareRelationshipSource,
  CareRelationshipStatus,
  DoctorVerificationStatus,
  EmergencyAccessStatus,
  MedicalRecordAccessAction,
  MedicalRecordAccessPurpose,
  NotificationType,
  Prisma,
  RecordGrantEventAction,
  RecordGrantPermission,
  RecordGrantStatus
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateRecordGrantDto } from './dto/create-record-grant.dto';
import { RequestEmergencyAccessDto } from './dto/request-emergency-access.dto';
import { RevokeRecordGrantDto } from './dto/revoke-record-grant.dto';

// Message d'erreur volontairement generique : un acces refuse ne doit jamais
// reveler de contenu medical ni de detail exploitable.
export const RECORD_ACCESS_DENIED_MESSAGE =
  'Access to this medical record is not authorized';

// Duree maximale d'un acces d'urgence (break-glass) : lecture seule, bornee.
export const EMERGENCY_ACCESS_TTL_MS = 24 * 60 * 60 * 1000;

export type RecordAccessBasis = 'EXPLICIT_GRANT' | 'EMERGENCY';

export type AccessDenialReason =
  | 'unverified_profile'
  | 'no_authorization'
  | 'authorization_revoked'
  | 'authorization_expired'
  | 'authorization_not_effective'
  | 'permission_denied';

export interface DoctorIdentity {
  id: string;
  userId: string;
  displayName: string;
}

const RECORD_REF_SELECT = {
  id: true,
  status: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.MedicalRecordSelect;

export type MedicalRecordRef = Prisma.MedicalRecordGetPayload<{
  select: typeof RECORD_REF_SELECT;
}>;

export interface AuthorizedRead {
  record: MedicalRecordRef;
  profile: DoctorIdentity;
  basis: RecordAccessBasis;
}

export interface AuthorizedWrite {
  record: MedicalRecordRef;
  profile: DoctorIdentity;
}

export interface RecordGrantView {
  id: string;
  doctorProfileId: string;
  doctorDisplayName: string | null;
  permissions: RecordGrantPermission[];
  status: RecordGrantStatus;
  expired: boolean;
  effectiveAt: Date;
  expiresAt: Date | null;
  reason: string | null;
  revokedAt: Date | null;
  revokedReason: string | null;
  createdAt: Date;
}

export interface RecordGrantHistoryItem {
  id: string;
  grantId: string;
  doctorProfileId: string;
  action: RecordGrantEventAction;
  reason: string | null;
  createdAt: Date;
}

export interface CareRelationshipView {
  id: string;
  doctorProfileId: string;
  doctorDisplayName: string | null;
  status: CareRelationshipStatus;
  source: CareRelationshipSource;
  establishedAt: Date;
  endedAt: Date | null;
}

export interface AccessEventView {
  id: string;
  action: MedicalRecordAccessAction;
  purpose: MedicalRecordAccessPurpose;
  reason: string | null;
  actor: 'PATIENT' | 'DOCTOR' | 'SYSTEM';
  actorDisplayName: string | null;
  targetType: string | null;
  targetId: string | null;
  createdAt: Date;
}

export interface EmergencyAccessView {
  id: string;
  doctorProfileId: string;
  doctorDisplayName: string | null;
  status: EmergencyAccessStatus;
  justification: string;
  grantedAt: Date;
  expiresAt: Date;
}

export interface PatientWithAccessView {
  patientUserId: string;
  permissions: RecordGrantPermission[];
  hasEmergencyAccess: boolean;
}

export interface AccessStatusView {
  verified: boolean;
  recordExists: boolean;
  readAllowed: boolean;
  writeAllowed: boolean;
  permissions: RecordGrantPermission[];
  basis: RecordAccessBasis | null;
  emergencyActive: boolean;
  grantExpiresAt: Date | null;
  emergencyExpiresAt: Date | null;
}

const GRANT_INCLUDE = {
  grantee: { select: { id: true, displayName: true } }
} satisfies Prisma.MedicalRecordGrantInclude;

type GrantWithGrantee = Prisma.MedicalRecordGrantGetPayload<{
  include: typeof GRANT_INCLUDE;
}>;

// Moteur d'autorisation du dossier medical (Jour 9). Point unique de decision :
// le role DOCTOR, l'affiliation ou un rendez-vous passe ne suffisent jamais.
// L'acces exige une autorisation explicite du patient (MedicalRecordGrant) ou,
// en lecture seule et de facon bornee, un acces d'urgence justifie.
@Injectable()
export class RecordAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentsService,
    private readonly notifications: NotificationsService
  ) {}

  // ------------------------------------------------------------ identities

  async getVerifiedDoctorOrNull(userId: string): Promise<DoctorIdentity | null> {
    const profile = await this.prisma.doctorProfile.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        displayName: true,
        verificationStatus: true
      }
    });
    if (
      !profile ||
      profile.verificationStatus !== DoctorVerificationStatus.VERIFIED
    ) {
      return null;
    }
    return { id: profile.id, userId: profile.userId, displayName: profile.displayName };
  }

  async assertVerifiedDoctor(userId: string): Promise<DoctorIdentity> {
    const profile = await this.getVerifiedDoctorOrNull(userId);
    if (!profile) {
      throw new ForbiddenException(RECORD_ACCESS_DENIED_MESSAGE);
    }
    return profile;
  }

  // ---------------------------------------------------------- authorizations

  async authorizeRead(
    actorUserId: string,
    patientUserId: string,
    requiredPermission: RecordGrantPermission
  ): Promise<AuthorizedRead> {
    const profile = await this.getVerifiedDoctorOrNull(actorUserId);
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }
    if (!profile) {
      await this.logDenied(record.id, {
        actorUserId,
        actorDoctorProfileId: null,
        purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
        reason: 'unverified_profile'
      });
      throw new ForbiddenException(RECORD_ACCESS_DENIED_MESSAGE);
    }

    const now = new Date();
    const grant = await this.latestGrant(record.id, profile.id);
    if (this.grantAllows(grant, requiredPermission, now)) {
      await this.ensureCareRelationship(patientUserId, profile.id, actorUserId);
      return { record, profile, basis: 'EXPLICIT_GRANT' };
    }

    const emergency = await this.findActiveEmergency(record.id, profile.id, now);
    if (emergency) {
      return { record, profile, basis: 'EMERGENCY' };
    }

    await this.logDenied(record.id, {
      actorUserId,
      actorDoctorProfileId: profile.id,
      purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
      reason: this.denialReason(grant, now)
    });
    throw new ForbiddenException(RECORD_ACCESS_DENIED_MESSAGE);
  }

  async authorizeWrite(
    actorUserId: string,
    patientUserId: string,
    requiredPermission: RecordGrantPermission
  ): Promise<AuthorizedWrite> {
    const profile = await this.getVerifiedDoctorOrNull(actorUserId);
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }
    if (!profile) {
      await this.logDenied(record.id, {
        actorUserId,
        actorDoctorProfileId: null,
        purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
        reason: 'unverified_profile'
      });
      throw new ForbiddenException(RECORD_ACCESS_DENIED_MESSAGE);
    }

    const now = new Date();
    const grant = await this.latestGrant(record.id, profile.id);
    if (this.grantAllows(grant, requiredPermission, now)) {
      await this.ensureCareRelationship(patientUserId, profile.id, actorUserId);
      return { record, profile };
    }

    // Pas de repli d'urgence pour l'ecriture : l'acces d'urgence est en lecture
    // seule par conception.
    await this.logDenied(record.id, {
      actorUserId,
      actorDoctorProfileId: profile.id,
      purpose: MedicalRecordAccessPurpose.EXPLICIT_GRANT,
      reason: this.denialReason(grant, now)
    });
    throw new ForbiddenException(RECORD_ACCESS_DENIED_MESSAGE);
  }

  // ------------------------------------------------------- patient: grants

  async createGrant(
    patientUserId: string,
    dto: CreateRecordGrantDto
  ): Promise<RecordGrantView> {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: dto.doctorProfileId },
      select: { id: true, userId: true, displayName: true, verificationStatus: true }
    });
    if (!doctor) {
      throw new NotFoundException('Professional profile not found');
    }
    if (doctor.verificationStatus !== DoctorVerificationStatus.VERIFIED) {
      throw new BadRequestException(
        'Grants can only be issued to verified professionals'
      );
    }

    const now = new Date();
    const effectiveAt = dto.effectiveAt ? new Date(dto.effectiveAt) : now;
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const reference = effectiveAt > now ? effectiveAt : now;
    if (expiresAt && expiresAt <= reference) {
      throw new BadRequestException(
        'expiresAt must be in the future and after effectiveAt'
      );
    }

    const permissions = Array.from(new Set(dto.permissions));
    const record = await this.ensurePatientRecord(patientUserId, patientUserId);

    const existing = await this.prisma.medicalRecordGrant.findFirst({
      where: {
        medicalRecordId: record.id,
        granteeDoctorProfileId: doctor.id,
        status: RecordGrantStatus.ACTIVE
      },
      select: { id: true }
    });

    const grant = await this.prisma.$transaction(async (tx) => {
      const saved = existing
        ? await tx.medicalRecordGrant.update({
            where: { id: existing.id },
            data: {
              permissions,
              effectiveAt,
              expiresAt,
              reason: dto.reason ?? null,
              grantedByUserId: patientUserId
            },
            include: GRANT_INCLUDE
          })
        : await tx.medicalRecordGrant.create({
            data: {
              medicalRecordId: record.id,
              granteeDoctorProfileId: doctor.id,
              permissions,
              effectiveAt,
              expiresAt,
              reason: dto.reason ?? null,
              grantedByUserId: patientUserId
            },
            include: GRANT_INCLUDE
          });
      await tx.medicalRecordGrantEvent.create({
        data: {
          grantId: saved.id,
          action: RecordGrantEventAction.GRANTED,
          actorUserId: patientUserId,
          reason: dto.reason ?? null
        }
      });
      await tx.medicalRecordAccessEvent.create({
        data: {
          medicalRecordId: record.id,
          actorUserId: patientUserId,
          actorDoctorProfileId: null,
          action: MedicalRecordAccessAction.GRANT_CREATED,
          purpose: MedicalRecordAccessPurpose.PATIENT_SELF,
          targetType: 'MedicalRecordGrant',
          targetId: saved.id
        }
      });
      return saved;
    });

    await this.ensureCareRelationship(patientUserId, doctor.id, doctor.userId);
    return this.toGrantView(grant, now);
  }

  async revokeGrant(
    patientUserId: string,
    grantId: string,
    dto: RevokeRecordGrantDto
  ): Promise<{ id: string; status: RecordGrantStatus }> {
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }
    const grant = await this.prisma.medicalRecordGrant.findUnique({
      where: { id: grantId },
      select: { id: true, medicalRecordId: true, status: true }
    });
    if (!grant || grant.medicalRecordId !== record.id) {
      throw new NotFoundException('Grant not found');
    }
    if (grant.status === RecordGrantStatus.REVOKED) {
      throw new ConflictException('Grant already revoked');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.medicalRecordGrant.update({
        where: { id: grant.id },
        data: {
          status: RecordGrantStatus.REVOKED,
          revokedAt: now,
          revokedByUserId: patientUserId,
          revokedReason: dto.reason ?? null
        }
      });
      await tx.medicalRecordGrantEvent.create({
        data: {
          grantId: grant.id,
          action: RecordGrantEventAction.REVOKED,
          actorUserId: patientUserId,
          reason: dto.reason ?? null
        }
      });
      await tx.medicalRecordAccessEvent.create({
        data: {
          medicalRecordId: record.id,
          actorUserId: patientUserId,
          actorDoctorProfileId: null,
          action: MedicalRecordAccessAction.GRANT_REVOKED,
          purpose: MedicalRecordAccessPurpose.PATIENT_SELF,
          targetType: 'MedicalRecordGrant',
          targetId: grant.id
        }
      });
    });

    return { id: grant.id, status: RecordGrantStatus.REVOKED };
  }

  async listGrants(patientUserId: string): Promise<RecordGrantView[]> {
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      return [];
    }
    const grants = await this.prisma.medicalRecordGrant.findMany({
      where: { medicalRecordId: record.id },
      include: GRANT_INCLUDE,
      orderBy: { createdAt: 'desc' }
    });
    const now = new Date();
    return grants.map((grant) => this.toGrantView(grant, now));
  }

  async listGrantHistory(
    patientUserId: string
  ): Promise<RecordGrantHistoryItem[]> {
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      return [];
    }
    const events = await this.prisma.medicalRecordGrantEvent.findMany({
      where: { grant: { medicalRecordId: record.id } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { grant: { select: { granteeDoctorProfileId: true } } }
    });
    return events.map((event) => ({
      id: event.id,
      grantId: event.grantId,
      doctorProfileId: event.grant.granteeDoctorProfileId,
      action: event.action,
      reason: event.reason,
      createdAt: event.createdAt
    }));
  }

  // --------------------------------------------------- patient: relations

  async listRelations(patientUserId: string): Promise<CareRelationshipView[]> {
    const relations = await this.prisma.careRelationship.findMany({
      where: { patientUserId },
      include: { doctor: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'desc' }
    });
    return relations.map((relation) => ({
      id: relation.id,
      doctorProfileId: relation.doctorProfileId,
      doctorDisplayName: relation.doctor.displayName,
      status: relation.status,
      source: relation.source,
      establishedAt: relation.establishedAt,
      endedAt: relation.endedAt
    }));
  }

  async endRelation(
    patientUserId: string,
    relationId: string
  ): Promise<CareRelationshipView> {
    const relation = await this.prisma.careRelationship.findUnique({
      where: { id: relationId },
      include: { doctor: { select: { id: true, displayName: true } } }
    });
    if (!relation || relation.patientUserId !== patientUserId) {
      throw new NotFoundException('Care relationship not found');
    }
    if (relation.status === CareRelationshipStatus.ENDED) {
      throw new ConflictException('Care relationship already ended');
    }

    const now = new Date();
    const updated = await this.prisma.careRelationship.update({
      where: { id: relation.id },
      data: {
        status: CareRelationshipStatus.ENDED,
        endedAt: now,
        endedByUserId: patientUserId
      },
      include: { doctor: { select: { id: true, displayName: true } } }
    });

    const record = await this.findRecordRef(patientUserId);
    if (record) {
      await this.logAccess(record.id, {
        actorUserId: patientUserId,
        actorDoctorProfileId: null,
        action: MedicalRecordAccessAction.RELATION_ENDED,
        purpose: MedicalRecordAccessPurpose.PATIENT_SELF,
        targetType: 'CareRelationship',
        targetId: relation.id
      });
    }

    return {
      id: updated.id,
      doctorProfileId: updated.doctorProfileId,
      doctorDisplayName: updated.doctor.displayName,
      status: updated.status,
      source: updated.source,
      establishedAt: updated.establishedAt,
      endedAt: updated.endedAt
    };
  }

  // ----------------------------------------------------- patient: audit log

  async listAccessEvents(
    patientUserId: string,
    limit = 100
  ): Promise<AccessEventView[]> {
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      return [];
    }
    const events = await this.prisma.medicalRecordAccessEvent.findMany({
      where: { medicalRecordId: record.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
      include: { actorDoctorProfile: { select: { displayName: true } } }
    });
    return events.map((event) => this.toAccessEventView(event, patientUserId));
  }

  // -------------------------------------------------- patient: emergency

  async listEmergencyAccess(
    patientUserId: string
  ): Promise<EmergencyAccessView[]> {
    await this.expireStaleEmergencies(new Date());
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      return [];
    }
    const grants = await this.prisma.emergencyAccessGrant.findMany({
      where: { medicalRecordId: record.id },
      include: { doctor: { select: { id: true, displayName: true } } },
      orderBy: { grantedAt: 'desc' },
      take: 100
    });
    return grants.map((grant) => this.toEmergencyView(grant));
  }

  // -------------------------------------------------- professional: action

  async requestEmergencyAccess(
    doctorUserId: string,
    patientUserId: string,
    dto: RequestEmergencyAccessDto
  ): Promise<EmergencyAccessView> {
    const profile = await this.assertVerifiedDoctor(doctorUserId);
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      throw new NotFoundException('Medical record not found');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMERGENCY_ACCESS_TTL_MS);
    const justification = dto.justification.trim();

    const existing = await this.findActiveEmergency(record.id, profile.id, now);
    const grant = existing
      ? await this.prisma.emergencyAccessGrant.update({
          where: { id: existing.id },
          data: { justification, expiresAt, grantedAt: now, status: EmergencyAccessStatus.ACTIVE },
          include: { doctor: { select: { id: true, displayName: true } } }
        })
      : await this.prisma.emergencyAccessGrant.create({
          data: {
            medicalRecordId: record.id,
            doctorProfileId: profile.id,
            justification,
            expiresAt,
            grantedAt: now
          },
          include: { doctor: { select: { id: true, displayName: true } } }
        });

    await this.logAccess(record.id, {
      actorUserId: doctorUserId,
      actorDoctorProfileId: profile.id,
      action: MedicalRecordAccessAction.EMERGENCY_ACCESS_GRANTED,
      purpose: MedicalRecordAccessPurpose.EMERGENCY,
      targetType: 'EmergencyAccessGrant',
      targetId: grant.id
    });

    // Le patient est informe (charge utile minimale, sans contenu clinique).
    try {
      await this.notifications.enqueue({
        type: NotificationType.EMERGENCY_ACCESS_GRANTED,
        recipientUserId: patientUserId,
        dedupeKey: `emergency_access_${grant.id}_${now.getTime()}`,
        payload: {
          doctorProfileId: profile.id,
          expiresAt: expiresAt.toISOString()
        }
      });
    } catch {
      // L'echec d'une notification ne doit jamais faire echouer l'acces d'urgence.
    }

    return this.toEmergencyView(grant);
  }

  // ----------------------------------------------- professional: introspection

  async patientsWithAccess(
    doctorUserId: string
  ): Promise<PatientWithAccessView[]> {
    const profile = await this.assertVerifiedDoctor(doctorUserId);
    const now = new Date();
    await this.expireStaleEmergencies(now);

    const grants = await this.prisma.medicalRecordGrant.findMany({
      where: {
        granteeDoctorProfileId: profile.id,
        status: RecordGrantStatus.ACTIVE
      },
      include: { medicalRecord: { select: { patientUserId: true } } }
    });
    const emergencies = await this.prisma.emergencyAccessGrant.findMany({
      where: {
        doctorProfileId: profile.id,
        status: EmergencyAccessStatus.ACTIVE,
        expiresAt: { gt: now }
      },
      include: { medicalRecord: { select: { patientUserId: true } } }
    });

    const byPatient = new Map<string, PatientWithAccessView>();
    for (const grant of grants) {
      if (!this.grantEffective(grant, now)) {
        continue;
      }
      const key = grant.medicalRecord.patientUserId;
      const entry =
        byPatient.get(key) ??
        { patientUserId: key, permissions: [], hasEmergencyAccess: false };
      entry.permissions = Array.from(
        new Set([...entry.permissions, ...grant.permissions])
      );
      byPatient.set(key, entry);
    }
    for (const emergency of emergencies) {
      const key = emergency.medicalRecord.patientUserId;
      const entry =
        byPatient.get(key) ??
        { patientUserId: key, permissions: [], hasEmergencyAccess: false };
      entry.hasEmergencyAccess = true;
      byPatient.set(key, entry);
    }
    return Array.from(byPatient.values());
  }

  async accessStatus(
    doctorUserId: string,
    patientUserId: string
  ): Promise<AccessStatusView> {
    const profile = await this.getVerifiedDoctorOrNull(doctorUserId);
    if (!profile) {
      return {
        verified: false,
        recordExists: false,
        readAllowed: false,
        writeAllowed: false,
        permissions: [],
        basis: null,
        emergencyActive: false,
        grantExpiresAt: null,
        emergencyExpiresAt: null
      };
    }
    const record = await this.findRecordRef(patientUserId);
    if (!record) {
      return {
        verified: true,
        recordExists: false,
        readAllowed: false,
        writeAllowed: false,
        permissions: [],
        basis: null,
        emergencyActive: false,
        grantExpiresAt: null,
        emergencyExpiresAt: null
      };
    }

    const now = new Date();
    const grant = await this.latestGrant(record.id, profile.id);
    const permissions =
      grant && this.grantEffective(grant, now) ? grant.permissions : [];
    const readPermissions = permissions.filter((permission) =>
      permission.startsWith('VIEW_')
    );
    const writePermissions = permissions.filter((permission) =>
      permission.startsWith('WRITE_')
    );
    const emergency = await this.findActiveEmergency(record.id, profile.id, now);
    const emergencyActive = emergency !== null;
    const readAllowed = readPermissions.length > 0 || emergencyActive;

    return {
      verified: true,
      recordExists: true,
      readAllowed,
      writeAllowed: writePermissions.length > 0,
      permissions,
      basis: readAllowed ? (readPermissions.length > 0 ? 'EXPLICIT_GRANT' : 'EMERGENCY') : null,
      emergencyActive,
      grantExpiresAt: grant?.expiresAt ?? null,
      emergencyExpiresAt: emergency?.expiresAt ?? null
    };
  }

  // ---------------------------------------------------------------- helpers

  private async findRecordRef(
    patientUserId: string
  ): Promise<MedicalRecordRef | null> {
    return this.prisma.medicalRecord.findUnique({
      where: { patientUserId },
      select: RECORD_REF_SELECT
    });
  }

  // Cree (ou retrouve) le dossier du patient. Expose pour permettre au service
  // clinique de garantir l'existence du dossier avant une lecture/ecriture.
  async ensurePatientRecord(
    patientUserId: string,
    actorUserId: string
  ): Promise<MedicalRecordRef> {
    const existing = await this.findRecordRef(patientUserId);
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.medicalRecord.create({
          data: { patientUserId },
          select: RECORD_REF_SELECT
        });
        await tx.medicalRecordAccessEvent.create({
          data: {
            medicalRecordId: created.id,
            actorUserId,
            actorDoctorProfileId: null,
            action: MedicalRecordAccessAction.RECORD_CREATED,
            purpose: MedicalRecordAccessPurpose.PATIENT_SELF
          }
        });
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.findRecordRef(patientUserId);
        if (raced) {
          return raced;
        }
      }
      throw error;
    }
  }

  private async latestGrant(
    medicalRecordId: string,
    doctorProfileId: string
  ): Promise<GrantWithGrantee | null> {
    return this.prisma.medicalRecordGrant.findFirst({
      where: { medicalRecordId, granteeDoctorProfileId: doctorProfileId },
      include: GRANT_INCLUDE,
      orderBy: { createdAt: 'desc' }
    });
  }

  private grantEffective(
    grant: Pick<GrantWithGrantee, 'effectiveAt' | 'expiresAt'>,
    now: Date
  ): boolean {
    if (grant.effectiveAt > now) {
      return false;
    }
    if (grant.expiresAt && grant.expiresAt <= now) {
      return false;
    }
    return true;
  }

  private grantAllows(
    grant: GrantWithGrantee | null,
    requiredPermission: RecordGrantPermission,
    now: Date
  ): boolean {
    if (!grant || grant.status !== RecordGrantStatus.ACTIVE) {
      return false;
    }
    if (!this.grantEffective(grant, now)) {
      return false;
    }
    return grant.permissions.includes(requiredPermission);
  }

  private denialReason(
    grant: GrantWithGrantee | null,
    now: Date
  ): AccessDenialReason {
    if (!grant) {
      return 'no_authorization';
    }
    if (grant.status === RecordGrantStatus.REVOKED) {
      return 'authorization_revoked';
    }
    if (grant.effectiveAt > now) {
      return 'authorization_not_effective';
    }
    if (grant.expiresAt && grant.expiresAt <= now) {
      return 'authorization_expired';
    }
    return 'permission_denied';
  }

  private async findActiveEmergency(
    medicalRecordId: string,
    doctorProfileId: string,
    now: Date
  ): Promise<
    Prisma.EmergencyAccessGrantGetPayload<{
      include: { doctor: { select: { id: true; displayName: true } } };
    }> | null
  > {
    return this.prisma.emergencyAccessGrant.findFirst({
      where: {
        medicalRecordId,
        doctorProfileId,
        status: EmergencyAccessStatus.ACTIVE,
        expiresAt: { gt: now }
      },
      include: { doctor: { select: { id: true, displayName: true } } }
    });
  }

  private async ensureCareRelationship(
    patientUserId: string,
    doctorProfileId: string,
    doctorUserId?: string
  ): Promise<void> {
    const existing = await this.prisma.careRelationship.findFirst({
      where: {
        patientUserId,
        doctorProfileId,
        status: CareRelationshipStatus.ACTIVE
      },
      select: { id: true }
    });
    if (existing) {
      return;
    }

    let source: CareRelationshipSource = CareRelationshipSource.PATIENT_GRANT;
    if (doctorUserId) {
      const viaAppointment = await this.appointments.hasCareRelationship(
        doctorUserId,
        patientUserId
      );
      if (viaAppointment) {
        source = CareRelationshipSource.APPOINTMENT;
      }
    }

    try {
      await this.prisma.careRelationship.create({
        data: { patientUserId, doctorProfileId, source }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  private async expireStaleEmergencies(now: Date): Promise<void> {
    const stale = await this.prisma.emergencyAccessGrant.findMany({
      where: {
        status: EmergencyAccessStatus.ACTIVE,
        expiresAt: { lte: now }
      },
      select: { id: true, medicalRecordId: true, doctorProfileId: true }
    });
    if (stale.length === 0) {
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.emergencyAccessGrant.updateMany({
        where: { id: { in: stale.map((grant) => grant.id) } },
        data: { status: EmergencyAccessStatus.EXPIRED }
      });
      for (const grant of stale) {
        await tx.medicalRecordAccessEvent.create({
          data: {
            medicalRecordId: grant.medicalRecordId,
            actorUserId: null,
            actorDoctorProfileId: grant.doctorProfileId,
            action: MedicalRecordAccessAction.EMERGENCY_ACCESS_EXPIRED,
            purpose: MedicalRecordAccessPurpose.EMERGENCY,
            targetType: 'EmergencyAccessGrant',
            targetId: grant.id,
            reason: 'emergency_expired'
          }
        });
      }
    });
  }

  // Journal d'acces (public) : uniquement des references et des enums, jamais
  // de contenu clinique. Utilise par le moteur et par le service clinique pour
  // tracer les lectures/ecritures accordees.
  async logAccess(
    medicalRecordId: string,
    input: {
      actorUserId: string | null;
      actorDoctorProfileId: string | null;
      action: MedicalRecordAccessAction;
      purpose: MedicalRecordAccessPurpose;
      targetType?: string | null;
      targetId?: string | null;
      reason?: string | null;
    }
  ): Promise<void> {
    await this.prisma.medicalRecordAccessEvent.create({
      data: {
        medicalRecordId,
        actorUserId: input.actorUserId,
        actorDoctorProfileId: input.actorDoctorProfileId,
        action: input.action,
        purpose: input.purpose,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        reason: input.reason ?? null
      }
    });
  }

  private async logDenied(
    medicalRecordId: string,
    input: {
      actorUserId: string | null;
      actorDoctorProfileId: string | null;
      purpose: MedicalRecordAccessPurpose;
      reason: AccessDenialReason;
    }
  ): Promise<void> {
    await this.logAccess(medicalRecordId, {
      actorUserId: input.actorUserId,
      actorDoctorProfileId: input.actorDoctorProfileId,
      action: MedicalRecordAccessAction.ACCESS_DENIED,
      purpose: input.purpose,
      reason: input.reason
    });
  }

  // ------------------------------------------------------------------ mappers

  private toGrantView(grant: GrantWithGrantee, now: Date): RecordGrantView {
    return {
      id: grant.id,
      doctorProfileId: grant.granteeDoctorProfileId,
      doctorDisplayName: grant.grantee.displayName,
      permissions: grant.permissions,
      status: grant.status,
      expired:
        grant.status === RecordGrantStatus.ACTIVE &&
        grant.expiresAt !== null &&
        grant.expiresAt <= now,
      effectiveAt: grant.effectiveAt,
      expiresAt: grant.expiresAt,
      reason: grant.reason,
      revokedAt: grant.revokedAt,
      revokedReason: grant.revokedReason,
      createdAt: grant.createdAt
    };
  }

  private toAccessEventView(
    event: Prisma.MedicalRecordAccessEventGetPayload<{
      include: { actorDoctorProfile: { select: { displayName: true } } };
    }>,
    patientUserId: string
  ): AccessEventView {
    let actor: 'PATIENT' | 'DOCTOR' | 'SYSTEM';
    if (event.actorDoctorProfileId) {
      actor = 'DOCTOR';
    } else if (event.actorUserId && event.actorUserId === patientUserId) {
      actor = 'PATIENT';
    } else {
      actor = 'SYSTEM';
    }
    return {
      id: event.id,
      action: event.action,
      purpose: event.purpose,
      reason: event.reason,
      actor,
      actorDisplayName: event.actorDoctorProfile?.displayName ?? null,
      targetType: event.targetType,
      targetId: event.targetId,
      createdAt: event.createdAt
    };
  }

  private toEmergencyView(
    grant: Prisma.EmergencyAccessGrantGetPayload<{
      include: { doctor: { select: { id: true; displayName: true } } };
    }>
  ): EmergencyAccessView {
    return {
      id: grant.id,
      doctorProfileId: grant.doctorProfileId,
      doctorDisplayName: grant.doctor.displayName,
      status: grant.status,
      justification: grant.justification,
      grantedAt: grant.grantedAt,
      expiresAt: grant.expiresAt
    };
  }
}
