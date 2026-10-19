import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AppointmentsService } from './appointments.service';

type Delegate = ReturnType<typeof createTxDelegate>;

function createTxDelegate() {
  return {
    appointmentSlot: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn()
    },
    appointment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    appointmentEvent: { create: jest.fn() },
    appointmentSchedule: { create: jest.fn(), update: jest.fn() },
    appointmentScheduleEvent: { create: jest.fn() }
  };
}

function createMockPrisma() {
  const tx = createTxDelegate();
  const prisma = {
    doctorFacilityAffiliation: { findUnique: jest.fn() },
    appointmentSchedule: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    appointmentSlot: {
      findFirst: jest.fn(),
      findMany: jest.fn()
    },
    appointment: {
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    $transaction: jest.fn(),
    __tx: tx
  };
  prisma.$transaction.mockImplementation(
    async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: Delegate) => unknown)(tx)
        : Promise.all(arg as Promise<unknown>[])
  );
  return prisma;
}

function futureDate(): Date {
  return new Date(Date.now() + 24 * 60 * 60 * 1000);
}

interface ScheduleFixture {
  id: string;
  timezone: string;
  visitDurationMinutes: number;
  confirmationMode: string;
  status: string;
}

interface SlotFixture {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  schedule: ScheduleFixture;
}

interface PublishedScheduleFixture {
  id: string;
  affiliationId: string;
  timezone: string;
  visitDurationMinutes: number;
  confirmationMode: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  affiliation: {
    id: string;
    status: string;
    doctorProfile: {
      id: string;
      userId: string;
      displayName: string;
      verificationStatus: string;
      isPubliclyListed: boolean;
    };
    facility: { id: string; displayName: string };
  };
}

function openSlot(overrides: Partial<SlotFixture> = {}): SlotFixture {
  return {
    id: 'slot1',
    startsAt: futureDate(),
    endsAt: new Date(futureDate().getTime() + 30 * 60 * 1000),
    status: 'OPEN',
    schedule: {
      id: 'sched1',
      timezone: 'Africa/Tunis',
      visitDurationMinutes: 30,
      confirmationMode: 'MANUAL',
      status: 'ACTIVE'
    },
    ...overrides
  };
}

function publishedSchedule(
  overrides: Partial<PublishedScheduleFixture> = {}
): PublishedScheduleFixture {
  return {
    id: 'sched1',
    affiliationId: 'aff1',
    timezone: 'Africa/Tunis',
    visitDurationMinutes: 30,
    confirmationMode: 'MANUAL',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    affiliation: {
      id: 'aff1',
      status: 'VERIFIED',
      doctorProfile: {
        id: 'profile1',
        userId: 'doctor1',
        displayName: 'Dr Test',
        verificationStatus: 'VERIFIED',
        isPubliclyListed: true
      },
      facility: { id: 'fac1', displayName: 'Clinique' }
    },
    ...overrides
  };
}

describe('AppointmentsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let notifications: { enqueue: jest.Mock };
  let service: AppointmentsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    notifications = {
      enqueue: jest.fn().mockResolvedValue({ id: 'notif1', status: 'PENDING' })
    };
    service = new AppointmentsService(
      prisma as unknown as PrismaService,
      notifications as unknown as NotificationsService
    );
  });

  describe('book', () => {
    it('creates a PENDING appointment and locks the slot when confirmation is required', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      prisma.__tx.appointmentSlot.findUnique.mockResolvedValue(openSlot());
      prisma.__tx.appointmentSlot.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.appointment.create.mockResolvedValue({ id: 'appt1' });

      const result = await service.book('patient1', { slotId: 'slot1' });

      expect(result).toEqual({ id: 'appt1', status: 'PENDING' });
      expect(prisma.__tx.appointmentSlot.updateMany).toHaveBeenCalledWith({
        where: { id: 'slot1', status: 'OPEN' },
        data: { status: 'BOOKED' }
      });
      expect(prisma.__tx.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            requiresConfirmation: true,
            patientUserId: 'patient1'
          })
        })
      );
      expect(prisma.__tx.appointmentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ action: 'CREATED' }) })
      );
    });

    it('auto-confirms when the schedule does not require confirmation', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      prisma.__tx.appointmentSlot.findUnique.mockResolvedValue(
        openSlot({ schedule: { ...openSlot().schedule, confirmationMode: 'AUTOMATIC' } })
      );
      prisma.__tx.appointmentSlot.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.appointment.create.mockResolvedValue({ id: 'appt1' });

      const result = await service.book('patient1', { slotId: 'slot1' });

      expect(result).toEqual({ id: 'appt1', status: 'CONFIRMED' });
      expect(prisma.__tx.appointmentEvent.create).toHaveBeenCalledTimes(2);
    });

    it('refuses online booking when confirmation is disabled', async () => {
      prisma.__tx.appointmentSlot.findUnique.mockResolvedValue(
        openSlot({
          schedule: { ...openSlot().schedule, confirmationMode: 'DISABLED' }
        })
      );
      await expect(service.book('patient1', { slotId: 'slot1' })).rejects.toThrow(
        ConflictException
      );
      expect(prisma.__tx.appointmentSlot.updateMany).not.toHaveBeenCalled();
    });

    it('deposits notifications for the patient and the doctor', async () => {
      prisma.__tx.appointmentSlot.findUnique.mockResolvedValue(openSlot());
      prisma.__tx.appointmentSlot.updateMany.mockResolvedValue({ count: 1 });
      prisma.__tx.appointment.create.mockResolvedValue({ id: 'appt1' });
      prisma.appointment.findUnique.mockResolvedValue({
        patientUserId: 'patient1',
        status: 'PENDING',
        slot: {
          startsAt: futureDate(),
          schedule: {
            affiliation: {
              doctorProfile: { userId: 'doctor1', displayName: 'Dr Test' },
              facility: { displayName: 'Clinique' }
            }
          }
        }
      });

      await service.book('patient1', { slotId: 'slot1' });

      expect(notifications.enqueue).toHaveBeenCalledTimes(2);
      const types = notifications.enqueue.mock.calls.map((call) => call[0].type);
      expect(types).toEqual([
        'APPOINTMENT_CREATED',
        'APPOINTMENT_CREATED'
      ]);
    });

    it('rejects a slot that is already booked', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      prisma.__tx.appointmentSlot.findUnique.mockResolvedValue(
        openSlot({ status: 'BOOKED' })
      );
      await expect(service.book('patient1', { slotId: 'slot1' })).rejects.toThrow(
        ConflictException
      );
      expect(prisma.__tx.appointmentSlot.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a slot that was just booked concurrently', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      prisma.__tx.appointmentSlot.findUnique.mockResolvedValue(openSlot());
      prisma.__tx.appointmentSlot.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.book('patient1', { slotId: 'slot1' })).rejects.toThrow(
        ConflictException
      );
    });

    it('rejects an inactive schedule', async () => {
      prisma.appointment.findUnique.mockResolvedValue(null);
      prisma.__tx.appointmentSlot.findUnique.mockResolvedValue(
        openSlot({ schedule: { ...openSlot().schedule, status: 'DISABLED' } })
      );
      await expect(service.book('patient1', { slotId: 'slot1' })).rejects.toThrow(
        ConflictException
      );
    });

    it('replays an existing appointment for the same idempotency key', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt-old',
        status: 'CONFIRMED'
      });
      const result = await service.book('patient1', {
        slotId: 'slot1',
        idempotencyKey: 'key-1'
      });
      expect(result).toEqual({ id: 'appt-old', status: 'CONFIRMED' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('forbids cancelling someone else\'s appointment', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue({
        id: 'appt1',
        status: 'CONFIRMED',
        patientUserId: 'other',
        slotId: 'slot1'
      });
      await expect(service.cancel('patient1', 'appt1', {})).rejects.toThrow(
        ForbiddenException
      );
    });

    it('rejects cancelling a terminal appointment', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue({
        id: 'appt1',
        status: 'COMPLETED',
        patientUserId: 'patient1',
        slotId: 'slot1'
      });
      await expect(
        service.cancel('patient1', 'appt1', {})
      ).rejects.toThrow(ConflictException);
    });

    it('cancels and reopens the slot', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue({
        id: 'appt1',
        status: 'CONFIRMED',
        patientUserId: 'patient1',
        slotId: 'slot1'
      });
      const result = await service.cancel('patient1', 'appt1', {
        reason: 'Impossible'
      });
      expect(result).toEqual({ id: 'appt1', status: 'CANCELLED' });
      expect(prisma.__tx.appointment.update).toHaveBeenCalledWith({
        where: { id: 'appt1' },
        data: { status: 'CANCELLED' }
      });
      expect(prisma.__tx.appointmentSlot.update).toHaveBeenCalledWith({
        where: { id: 'slot1' },
        data: { status: 'OPEN' }
      });
    });
  });

  describe('decide', () => {
    function appointmentFor(owner: string, status: AppointmentStatus) {
      return {
        id: 'appt1',
        status,
        slotId: 'slot1',
        slot: {
          id: 'slot1',
          schedule: {
            affiliation: { doctorProfile: { userId: owner } }
          }
        }
      };
    }

    it('forbids decisions from a non-owner', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue(
        appointmentFor('doctor1', AppointmentStatus.PENDING)
      );
      await expect(
        service.decide('intruder', 'appt1', { action: 'CONFIRM' })
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a facility manager to decide', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue({
        id: 'appt1',
        status: AppointmentStatus.PENDING,
        slotId: 'slot1',
        slot: {
          id: 'slot1',
          schedule: {
            affiliation: {
              doctorProfile: { userId: 'doctor1' },
              facility: { id: 'f1', managers: [{ userId: 'manager1' }] }
            }
          }
        }
      });
      const result = await service.decide('manager1', 'appt1', {
        action: 'CONFIRM'
      });
      expect(result).toEqual({ id: 'appt1', status: 'CONFIRMED' });
    });

    it('rejects a REJECT without a reason', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue(
        appointmentFor('doctor1', AppointmentStatus.PENDING)
      );
      await expect(
        service.decide('doctor1', 'appt1', { action: 'REJECT' })
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an invalid transition', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue(
        appointmentFor('doctor1', AppointmentStatus.PENDING)
      );
      await expect(
        service.decide('doctor1', 'appt1', { action: 'COMPLETE' })
      ).rejects.toThrow(ConflictException);
    });

    it('confirms without reopening the slot', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue(
        appointmentFor('doctor1', AppointmentStatus.PENDING)
      );
      const result = await service.decide('doctor1', 'appt1', { action: 'CONFIRM' });
      expect(result).toEqual({ id: 'appt1', status: 'CONFIRMED' });
      expect(prisma.__tx.appointmentSlot.update).not.toHaveBeenCalled();
    });

    it('rejects a pending appointment and reopens the slot when a reason is given', async () => {
      prisma.__tx.appointment.findUnique.mockResolvedValue(
        appointmentFor('doctor1', AppointmentStatus.PENDING)
      );
      const result = await service.decide('doctor1', 'appt1', {
        action: 'REJECT',
        reason: 'Horaire clos'
      });
      expect(result).toEqual({ id: 'appt1', status: 'CANCELLED' });
      expect(prisma.__tx.appointmentEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'REJECTED' })
        })
      );
      expect(prisma.__tx.appointmentSlot.update).toHaveBeenCalledWith({
        where: { id: 'slot1' },
        data: { status: 'OPEN' }
      });
    });
  });

  describe('generateSlots', () => {
    it('rejects an inverted time window', async () => {
      prisma.appointmentSchedule.findUnique.mockResolvedValue(
        publishedSchedule()
      );
      await expect(
        service.generateSlots('doctor1', 'sched1', {
          date: '2026-11-02',
          startTime: '13:00',
          endTime: '09:00'
        })
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('generates open slots every visitDurationMinutes', async () => {
      prisma.appointmentSchedule.findUnique.mockResolvedValue(publishedSchedule());
      prisma.__tx.appointmentSlot.findMany.mockResolvedValue([]);
      prisma.__tx.appointmentSlot.create.mockResolvedValue({});

      const result = await service.generateSlots('doctor1', 'sched1', {
        date: '2026-11-02',
        startTime: '09:00',
        endTime: '10:00'
      });

      expect(result.created).toBe(2); // 09:00 et 09:30
      expect(result.skipped).toBe(0);
    });

    it('refuses to replace a date that still has booked slots', async () => {
      prisma.appointmentSchedule.findUnique.mockResolvedValue(publishedSchedule());
      prisma.__tx.appointmentSlot.count.mockResolvedValue(1);
      await expect(
        service.generateSlots('doctor1', 'sched1', {
          date: '2026-11-02',
          startTime: '09:00',
          endTime: '10:00',
          replaceExisting: true
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('availability', () => {
    it('returns open slots for a published schedule', async () => {
      prisma.appointmentSchedule.findUnique.mockResolvedValue(publishedSchedule());
      prisma.appointmentSlot.findMany.mockResolvedValue([
        { id: 'slot1', startsAt: futureDate(), endsAt: futureDate(), status: 'OPEN' }
      ]);
      const view = await service.availability('sched1', {});
      expect(view.slots).toHaveLength(1);
      expect(view.doctor.displayName).toBe('Dr Test');
      expect(view.facility.displayName).toBe('Clinique');
    });

    it('hides unpublished schedules with a 404', async () => {
      prisma.appointmentSchedule.findUnique.mockResolvedValue(
        publishedSchedule({
          affiliation: {
            ...publishedSchedule().affiliation,
            doctorProfile: {
              ...publishedSchedule().affiliation.doctorProfile,
              isPubliclyListed: false
            }
          }
        })
      );
      await expect(service.availability('sched1', {})).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('upsertSchedule', () => {
    it('rejects an unknown timezone', async () => {
      prisma.doctorFacilityAffiliation.findUnique.mockResolvedValue({
        id: 'aff1',
        status: 'VERIFIED',
        doctorProfile: { id: 'p1', displayName: 'Dr', userId: 'doctor1' },
        facility: { id: 'f1', displayName: 'Clinique' }
      });
      await expect(
        service.upsertSchedule('doctor1', 'aff1', { timezone: 'Mars/Phobos' })
      ).rejects.toThrow(BadRequestException);
    });

    it('forbids foreign affiliations', async () => {
      prisma.doctorFacilityAffiliation.findUnique.mockResolvedValue({
        id: 'aff1',
        status: 'VERIFIED',
        doctorProfile: { id: 'p1', displayName: 'Dr', userId: 'other' },
        facility: { id: 'f1', displayName: 'Clinique' }
      });
      await expect(
        service.upsertSchedule('doctor1', 'aff1', {})
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates the schedule and records a CREATED schedule event', async () => {
      prisma.doctorFacilityAffiliation.findUnique.mockResolvedValue({
        id: 'aff1',
        status: 'VERIFIED',
        doctorProfile: { id: 'p1', displayName: 'Dr', userId: 'doctor1' },
        facility: { id: 'f1', displayName: 'Clinique', managers: [] }
      });
      prisma.appointmentSchedule.findUnique.mockResolvedValue(null);
      prisma.__tx.appointmentSchedule.create.mockResolvedValue({
        id: 'sched1',
        affiliationId: 'aff1',
        timezone: 'Africa/Tunis',
        visitDurationMinutes: 30,
        confirmationMode: 'AUTOMATIC',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const view = await service.upsertSchedule('doctor1', 'aff1', {
        confirmationMode: 'AUTOMATIC'
      });

      expect(view.confirmationMode).toBe('AUTOMATIC');
      expect(view.requiresConfirmation).toBe(false);
      expect(prisma.__tx.appointmentScheduleEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATED' })
        })
      );
    });

    it('allows a facility manager to configure the schedule', async () => {
      prisma.doctorFacilityAffiliation.findUnique.mockResolvedValue({
        id: 'aff1',
        status: 'VERIFIED',
        doctorProfile: { id: 'p1', displayName: 'Dr', userId: 'doctor1' },
        facility: {
          id: 'f1',
          displayName: 'Clinique',
          managers: [{ userId: 'manager1' }]
        }
      });
      prisma.appointmentSchedule.findUnique.mockResolvedValue(null);
      prisma.__tx.appointmentSchedule.create.mockResolvedValue({
        id: 'sched1',
        affiliationId: 'aff1',
        timezone: 'Africa/Tunis',
        visitDurationMinutes: 30,
        confirmationMode: 'MANUAL',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const view = await service.upsertSchedule('manager1', 'aff1', {});
      expect(view.id).toBe('sched1');
    });

    it('rejects inconsistent confirmation inputs', async () => {
      prisma.doctorFacilityAffiliation.findUnique.mockResolvedValue({
        id: 'aff1',
        status: 'VERIFIED',
        doctorProfile: { id: 'p1', displayName: 'Dr', userId: 'doctor1' },
        facility: { id: 'f1', displayName: 'Clinique', managers: [] }
      });
      await expect(
        service.upsertSchedule('doctor1', 'aff1', {
          requiresConfirmation: true,
          confirmationMode: 'AUTOMATIC'
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAppointment', () => {
    it('forbids access to unrelated users', async () => {
      prisma.appointment.findUnique.mockResolvedValue({
        id: 'appt1',
        status: 'PENDING',
        reason: null,
        requiresConfirmation: true,
        idempotencyKey: 'k',
        createdAt: new Date(),
        updatedAt: new Date(),
        patientUserId: 'patient1',
        slot: {
          id: 'slot1',
          startsAt: new Date(),
          endsAt: new Date(),
          status: 'OPEN',
          schedule: {
            id: 'sched1',
            timezone: 'Africa/Tunis',
            affiliationId: 'aff1',
            confirmationMode: 'MANUAL',
            affiliation: {
              id: 'aff1',
              doctorProfile: { id: 'p1', displayName: 'Dr', userId: 'doctor1' },
              facility: { id: 'f1', displayName: 'Clinique' }
            }
          }
        },
        patient: { id: 'patient1', email: 'p@example.tn', phone: null },
        events: []
      });
      await expect(
        service.getAppointment('stranger', 'appt1', false)
      ).rejects.toThrow(ForbiddenException);
    });
  });
});