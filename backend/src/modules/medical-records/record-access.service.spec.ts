import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import {
  DoctorVerificationStatus,
  EmergencyAccessStatus,
  MedicalRecordAccessAction,
  MedicalRecordStatus,
  RecordGrantPermission,
  RecordGrantStatus
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  EMERGENCY_ACCESS_TTL_MS,
  RECORD_ACCESS_DENIED_MESSAGE,
  RecordAccessService
} from './record-access.service';

const RECORD = {
  id: 'rec1',
  status: MedicalRecordStatus.ACTIVE,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
};

const VERIFIED_DOCTOR = {
  id: 'doc1',
  userId: 'user-doc-1',
  displayName: 'Dr House',
  verificationStatus: DoctorVerificationStatus.VERIFIED
};

function grant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'grant1',
    medicalRecordId: 'rec1',
    granteeDoctorProfileId: 'doc1',
    permissions: [RecordGrantPermission.VIEW_RECORD],
    status: RecordGrantStatus.ACTIVE,
    effectiveAt: new Date('2020-01-01T00:00:00Z'),
    expiresAt: null,
    reason: null,
    grantedByUserId: 'patient1',
    revokedByUserId: null,
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date('2020-01-01T00:00:00Z'),
    updatedAt: new Date('2020-01-01T00:00:00Z'),
    grantee: { id: 'doc1', displayName: 'Dr House' },
    ...overrides
  };
}

function emergency(overrides: Record<string, unknown> = {}) {
  return {
    id: 'urg1',
    medicalRecordId: 'rec1',
    doctorProfileId: 'doc1',
    justification: 'Patient inconscient admis aux urgences pour evaluation.',
    status: EmergencyAccessStatus.ACTIVE,
    grantedAt: new Date(),
    expiresAt: new Date(Date.now() + EMERGENCY_ACCESS_TTL_MS),
    createdAt: new Date(),
    updatedAt: new Date(),
    doctor: { id: 'doc1', displayName: 'Dr House' },
    ...overrides
  };
}

function createTx() {
  return {
    medicalRecord: { create: jest.fn() },
    medicalRecordAccessEvent: { create: jest.fn() },
    medicalRecordGrant: { create: jest.fn(), update: jest.fn() },
    medicalRecordGrantEvent: { create: jest.fn() },
    emergencyAccessGrant: { updateMany: jest.fn() }
  };
}

function createMockPrisma() {
  const tx = createTx();
  const prisma = {
    doctorProfile: { findUnique: jest.fn() },
    medicalRecord: { findUnique: jest.fn() },
    medicalRecordAccessEvent: { create: jest.fn(), findMany: jest.fn() },
    medicalRecordGrant: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    medicalRecordGrantEvent: { findMany: jest.fn(), create: jest.fn() },
    emergencyAccessGrant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    careRelationship: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    $transaction: jest.fn(),
    __tx: tx
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (client: typeof tx) => unknown)(tx)
      : Promise.all(arg as Promise<unknown>[])
  );
  return prisma;
}

describe('RecordAccessService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let appointments: { hasCareRelationship: jest.Mock };
  let notifications: { enqueue: jest.Mock };
  let service: RecordAccessService;

  beforeEach(() => {
    prisma = createMockPrisma();
    appointments = { hasCareRelationship: jest.fn().mockResolvedValue(false) };
    notifications = {
      enqueue: jest.fn().mockResolvedValue({ id: 'notif1', status: 'PENDING' })
    };
    service = new RecordAccessService(
      prisma as unknown as PrismaService,
      appointments as unknown as AppointmentsService,
      notifications as unknown as NotificationsService
    );
  });

  function expectDenied(reason: string): void {
    expect(prisma.medicalRecordAccessEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: MedicalRecordAccessAction.ACCESS_DENIED,
          reason
        })
      })
    );
  }

  describe('authorizeRead', () => {
    it('rejects when the record does not exist', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(null);

      await expect(
        service.authorizeRead('user-doc-1', 'patient1', RecordGrantPermission.VIEW_RECORD)
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('denies and audits an unverified professional', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue({
        ...VERIFIED_DOCTOR,
        verificationStatus: DoctorVerificationStatus.PENDING
      });
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);

      await expect(
        service.authorizeRead('user-doc-1', 'patient1', RecordGrantPermission.VIEW_RECORD)
      ).rejects.toThrow(RECORD_ACCESS_DENIED_MESSAGE);
      expectDenied('unverified_profile');
    });

    it('denies when no authorization exists', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(null);
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.authorizeRead('user-doc-1', 'patient1', RecordGrantPermission.VIEW_RECORD)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectDenied('no_authorization');
    });

    it('denies a revoked authorization', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(
        grant({ status: RecordGrantStatus.REVOKED, revokedAt: new Date() })
      );
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.authorizeRead('user-doc-1', 'patient1', RecordGrantPermission.VIEW_RECORD)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectDenied('authorization_revoked');
    });

    it('denies an expired authorization', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(
        grant({ expiresAt: new Date('2020-02-01T00:00:00Z') })
      );
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.authorizeRead('user-doc-1', 'patient1', RecordGrantPermission.VIEW_RECORD)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectDenied('authorization_expired');
    });

    it('denies a not-yet-effective authorization', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(
        grant({ effectiveAt: new Date('2999-01-01T00:00:00Z') })
      );
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.authorizeRead('user-doc-1', 'patient1', RecordGrantPermission.VIEW_RECORD)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectDenied('authorization_not_effective');
    });

    it('denies when the required permission is missing', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(
        grant({ permissions: [RecordGrantPermission.VIEW_OBSERVATIONS] })
      );
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);

      await expect(
        service.authorizeRead('user-doc-1', 'patient1', RecordGrantPermission.VIEW_RECORD)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectDenied('permission_denied');
    });

    it('authorizes an active grant with the permission', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(grant());
      prisma.careRelationship.findFirst.mockResolvedValue({ id: 'rel1' });

      const result = await service.authorizeRead(
        'user-doc-1',
        'patient1',
        RecordGrantPermission.VIEW_RECORD
      );

      expect(result.basis).toBe('EXPLICIT_GRANT');
      expect(result.record.id).toBe('rec1');
      expect(prisma.medicalRecordAccessEvent.create).not.toHaveBeenCalled();
    });

    it('falls back to a read-only emergency access when no grant exists', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(null);
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(emergency());

      const result = await service.authorizeRead(
        'user-doc-1',
        'patient1',
        RecordGrantPermission.VIEW_RECORD
      );

      expect(result.basis).toBe('EMERGENCY');
      expect(prisma.medicalRecordAccessEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('authorizeWrite', () => {
    it('rejects a read-only grant for a write', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(grant());

      await expect(
        service.authorizeWrite(
          'user-doc-1',
          'patient1',
          RecordGrantPermission.WRITE_ENCOUNTERS
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectDenied('permission_denied');
    });

    it('never falls back to emergency access for a write', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(null);
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(emergency());

      await expect(
        service.authorizeWrite(
          'user-doc-1',
          'patient1',
          RecordGrantPermission.WRITE_ENCOUNTERS
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expectDenied('no_authorization');
    });

    it('authorizes a write when the write permission is granted', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(
        grant({ permissions: [RecordGrantPermission.WRITE_ENCOUNTERS] })
      );
      prisma.careRelationship.findFirst.mockResolvedValue({ id: 'rel1' });

      const result = await service.authorizeWrite(
        'user-doc-1',
        'patient1',
        RecordGrantPermission.WRITE_ENCOUNTERS
      );

      expect(result.profile.id).toBe('doc1');
    });
  });

  describe('createGrant', () => {
    it('refuses to issue a grant to an unverified professional', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue({
        ...VERIFIED_DOCTOR,
        verificationStatus: DoctorVerificationStatus.PENDING
      });

      await expect(
        service.createGrant('patient1', {
          doctorProfileId: 'doc1',
          permissions: [RecordGrantPermission.VIEW_RECORD]
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an expiry that is not in the future', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);

      await expect(
        service.createGrant('patient1', {
          doctorProfileId: 'doc1',
          permissions: [RecordGrantPermission.VIEW_RECORD],
          expiresAt: '2020-01-01T00:00:00.000Z'
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates the grant and records the granted event', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findFirst.mockResolvedValue(null);
      prisma.__tx.medicalRecordGrant.create.mockResolvedValue(grant());
      prisma.careRelationship.findFirst.mockResolvedValue({ id: 'rel1' });

      const result = await service.createGrant('patient1', {
        doctorProfileId: 'doc1',
        permissions: [RecordGrantPermission.VIEW_RECORD]
      });

      expect(result.id).toBe('grant1');
      expect(prisma.__tx.medicalRecordGrantEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'GRANTED', actorUserId: 'patient1' })
        })
      );
    });
  });

  describe('revokeGrant', () => {
    it('rejects revoking an already revoked grant', async () => {
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.medicalRecordGrant.findUnique.mockResolvedValue({
        id: 'grant1',
        medicalRecordId: 'rec1',
        status: RecordGrantStatus.REVOKED
      });

      await expect(
        service.revokeGrant('patient1', 'grant1', {})
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('requestEmergencyAccess', () => {
    it('grants bounded emergency access and notifies the patient', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecord.findUnique.mockResolvedValue(RECORD);
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);
      prisma.emergencyAccessGrant.create.mockResolvedValue(emergency());

      const before = Date.now();
      const result = await service.requestEmergencyAccess('user-doc-1', 'patient1', {
        justification: 'Patient inconscient admis aux urgences pour evaluation.'
      });
      const after = Date.now();

      expect(result.doctorProfileId).toBe('doc1');
      expect(result.status).toBe(EmergencyAccessStatus.ACTIVE);
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(
        before + EMERGENCY_ACCESS_TTL_MS
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        after + EMERGENCY_ACCESS_TTL_MS
      );
      expect(prisma.medicalRecordAccessEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: MedicalRecordAccessAction.EMERGENCY_ACCESS_GRANTED
          })
        })
      );
      expect(notifications.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ recipientUserId: 'patient1' })
      );
    });
  });

  describe('patientsWithAccess', () => {
    it('aggregates active grants and emergency access per patient', async () => {
      prisma.doctorProfile.findUnique.mockResolvedValue(VERIFIED_DOCTOR);
      prisma.medicalRecordGrant.findMany.mockResolvedValue([
        grant({
          permissions: [RecordGrantPermission.VIEW_RECORD],
          medicalRecord: { patientUserId: 'patient1' }
        })
      ]);
      prisma.emergencyAccessGrant.findMany.mockResolvedValue([
        emergency({ medicalRecord: { patientUserId: 'patient2' } })
      ]);

      const result = await service.patientsWithAccess('user-doc-1');

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            patientUserId: 'patient1',
            permissions: [RecordGrantPermission.VIEW_RECORD],
            hasEmergencyAccess: false
          }),
          expect.objectContaining({
            patientUserId: 'patient2',
            hasEmergencyAccess: true
          })
        ])
      );
    });
  });
});
