import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  AppointmentConfirmationMode,
  AppointmentEventAction,
  AppointmentScheduleEventAction,
  AppointmentScheduleStatus,
  AppointmentSlotStatus,
  AppointmentStatus,
  FacilityAffiliationStatus,
  NotificationType,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { DecideAppointmentDto } from './dto/decide-appointment.dto';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { ListScheduleAppointmentsQueryDto } from './dto/list-schedule-appointments-query.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import {
  addMinutes,
  isValidDateString,
  isValidTimeString,
  isValidTimeZone,
  zonedDateRange,
  zonedDateTimeToUtc
} from './time.util';

const DEFAULT_TIMEZONE = 'Africa/Tunis';
const DEFAULT_DURATION = 30;
const DEFAULT_LOOKAHEAD_DAYS = 14;

const SLOT_VIEW_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  status: true
} satisfies Prisma.AppointmentSlotSelect;

const PATIENT_CONTACT_SELECT = {
  id: true,
  email: true,
  phone: true
} satisfies Prisma.UserSelect;

const APPOINTMENT_SELECT = {
  id: true,
  status: true,
  reason: true,
  requiresConfirmation: true,
  idempotencyKey: true,
  createdAt: true,
  updatedAt: true,
  patientUserId: true,
  slot: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      schedule: {
        select: {
          id: true,
          timezone: true,
          affiliationId: true,
          confirmationMode: true,
          affiliation: {
            select: {
              id: true,
              doctorProfile: {
                select: { id: true, displayName: true, userId: true }
              },
              facility: {
                select: { id: true, displayName: true }
              }
            }
          }
        }
      }
    }
  },
  patient: { select: PATIENT_CONTACT_SELECT }
} satisfies Prisma.AppointmentSelect;

type AppointmentSelectPayload = Prisma.AppointmentGetPayload<{
  select: typeof APPOINTMENT_SELECT;
}>;

export interface ScheduleView {
  id: string;
  affiliationId: string;
  timezone: string;
  visitDurationMinutes: number;
  confirmationMode: AppointmentConfirmationMode;
  // Champ derive, conserve pour la compatibilite (AUTOMATIC => false).
  requiresConfirmation: boolean;
  status: AppointmentScheduleStatus;
  createdAt: Date;
  updatedAt: Date;
  doctor: { id: string; displayName: string };
  facility: { id: string; displayName: string };
}

export interface SlotView {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentSlotStatus;
}

export interface AvailabilityView {
  schedule: {
    id: string;
    affiliationId: string;
    timezone: string;
    visitDurationMinutes: number;
    confirmationMode: AppointmentConfirmationMode;
    requiresConfirmation: boolean;
  };
  doctor: { id: string; displayName: string };
  facility: { id: string; displayName: string };
  slots: SlotView[];
}

export interface AppointmentEventView {
  id: string;
  action: AppointmentEventAction;
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus | null;
  reason: string | null;
  createdAt: Date;
  actorId: string | null;
}

export interface AppointmentView {
  id: string;
  status: AppointmentStatus;
  reason: string | null;
  requiresConfirmation: boolean;
  createdAt: Date;
  updatedAt: Date;
  slot: SlotView;
  schedule: { id: string; timezone: string; affiliationId: string };
  doctor: { id: string; displayName: string };
  facility: { id: string; displayName: string };
  patient: { id: string; email: string | null; phone: string | null };
  events: AppointmentEventView[];
}

export interface ScheduleAppointmentView {
  slot: SlotView;
  appointment: {
    id: string;
    status: AppointmentStatus;
    reason: string | null;
    requiresConfirmation: boolean;
    createdAt: Date;
    updatedAt: Date;
    patient: { id: string; email: string | null; phone: string | null } | null;
  } | null;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  // ------------------------------------------------------- agendas (praticien)

  async getScheduleByAffiliation(
    userId: string,
    affiliationId: string
  ): Promise<ScheduleView> {
    const affiliation = await this.assertAffiliationOwner(userId, affiliationId);
    const schedule = await this.prisma.appointmentSchedule.findUnique({
      where: { affiliationId: affiliation.id }
    });
    if (!schedule) {
      throw new NotFoundException('No schedule has been configured yet');
    }
    return this.toScheduleView(schedule, affiliation);
  }

  async upsertSchedule(
    userId: string,
    affiliationId: string,
    dto: UpdateScheduleDto
  ): Promise<ScheduleView> {
    const affiliation = await this.assertAffiliationOwner(userId, affiliationId);

    if (dto.timezone !== undefined && !isValidTimeZone(dto.timezone)) {
      throw new BadRequestException(`Unknown timezone: ${dto.timezone}`);
    }

    const confirmationMode = this.resolveConfirmationMode(dto);

    const existing = await this.prisma.appointmentSchedule.findUnique({
      where: { affiliationId }
    });

    if (existing) {
      const changes: Prisma.AppointmentScheduleUpdateInput = {
        ...(dto.timezone === undefined ? {} : { timezone: dto.timezone }),
        ...(dto.visitDurationMinutes === undefined
          ? {}
          : { visitDurationMinutes: dto.visitDurationMinutes }),
        ...(confirmationMode === undefined ? {} : { confirmationMode }),
        ...(dto.status === undefined ? {} : { status: dto.status })
      };

      const schedule =
        Object.keys(changes).length === 0
          ? existing
          : await this.prisma.$transaction(async (tx) => {
              const updated = await tx.appointmentSchedule.update({
                where: { id: existing.id },
                data: changes
              });
              await tx.appointmentScheduleEvent.create({
                data: {
                  scheduleId: updated.id,
                  actorId: userId,
                  action: AppointmentScheduleEventAction.UPDATED,
                  changes: this.scheduleSnapshot(updated)
                }
              });
              return updated;
            });

      return this.toScheduleView(schedule, affiliation);
    }

    const schedule = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointmentSchedule.create({
        data: {
          affiliationId,
          timezone: dto.timezone ?? DEFAULT_TIMEZONE,
          visitDurationMinutes: dto.visitDurationMinutes ?? DEFAULT_DURATION,
          confirmationMode: confirmationMode ?? AppointmentConfirmationMode.MANUAL,
          status: dto.status ?? AppointmentScheduleStatus.ACTIVE
        }
      });
      await tx.appointmentScheduleEvent.create({
        data: {
          scheduleId: created.id,
          actorId: userId,
          action: AppointmentScheduleEventAction.CREATED,
          changes: this.scheduleSnapshot(created)
        }
      });
      return created;
    });

    return this.toScheduleView(schedule, affiliation);
  }

  async generateSlots(
    userId: string,
    scheduleId: string,
    dto: GenerateSlotsDto
  ): Promise<{ created: number; skipped: number; date: string }> {
    const schedule = await this.assertScheduleOwner(userId, scheduleId);
    const timezone = schedule.timezone;

    if (!isValidDateString(dto.date)) {
      throw new BadRequestException(`Invalid date: ${dto.date}`);
    }
    if (!isValidTimeString(dto.startTime) || !isValidTimeString(dto.endTime)) {
      throw new BadRequestException('Times must use HH:MM format');
    }

    const from = zonedDateTimeToUtc(dto.date, dto.startTime, timezone);
    const to = zonedDateTimeToUtc(dto.date, dto.endTime, timezone);
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('endTime must be after startTime');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.replaceExisting) {
        const booked = await tx.appointmentSlot.count({
          where: {
            scheduleId,
            startsAt: { gte: from, lt: to },
            status: AppointmentSlotStatus.BOOKED
          }
        });
        if (booked > 0) {
          throw new ConflictException(
            'Cannot replace: some slots on this date are already booked'
          );
        }
        await tx.appointmentSlot.deleteMany({
          where: {
            scheduleId,
            startsAt: { gte: from, lt: to },
            status: AppointmentSlotStatus.OPEN
          }
        });
      }

      const existing = await tx.appointmentSlot.findMany({
        where: {
          scheduleId,
          startsAt: { lt: to },
          endsAt: { gt: from }
        },
        select: { startsAt: true, endsAt: true }
      });

      const duration = schedule.visitDurationMinutes;
      let created = 0;
      let skipped = 0;

      for (let start = from; start.getTime() < to.getTime(); start = addMinutes(start, duration)) {
        const end = addMinutes(start, duration);
        if (end.getTime() > to.getTime()) {
          break;
        }
        const overlaps = existing.some(
          (slot) => start.getTime() < slot.endsAt.getTime() && end.getTime() > slot.startsAt.getTime()
        );
        if (overlaps) {
          skipped += 1;
          continue;
        }
        await tx.appointmentSlot.create({
          data: { scheduleId, startsAt: start, endsAt: end, status: AppointmentSlotStatus.OPEN }
        });
        created += 1;
      }

      return { created, skipped, date: dto.date };
    });
  }

  async deleteSlot(
    userId: string,
    scheduleId: string,
    slotId: string
  ): Promise<{ id: string; deleted: boolean }> {
    await this.assertScheduleOwner(userId, scheduleId);
    const slot = await this.prisma.appointmentSlot.findFirst({
      where: { id: slotId, scheduleId }
    });
    if (!slot) {
      throw new NotFoundException('Slot not found');
    }
    if (slot.status !== AppointmentSlotStatus.OPEN) {
      throw new ConflictException('Only open slots can be deleted');
    }
    if (slot.startsAt.getTime() <= Date.now()) {
      throw new ConflictException('Past slots cannot be deleted');
    }
    await this.prisma.appointmentSlot.delete({ where: { id: slotId } });
    return { id: slotId, deleted: true };
  }

  async listScheduleAppointments(
    userId: string,
    scheduleId: string,
    query: ListScheduleAppointmentsQueryDto
  ): Promise<{ scheduleId: string; items: ScheduleAppointmentView[] }> {
    await this.assertScheduleOwner(userId, scheduleId);

    const from = query.from
      ? new Date(`${query.from}T00:00:00.000Z`)
      : new Date();
    const to = query.to
      ? new Date(`${query.to}T23:59:59.999Z`)
      : addMinutes(from, 24 * 60 * DEFAULT_LOOKAHEAD_DAYS);

    const slots = await this.prisma.appointmentSlot.findMany({
      where: { scheduleId, startsAt: { gte: from, lte: to } },
      orderBy: { startsAt: 'asc' },
      select: {
        ...SLOT_VIEW_SELECT,
        appointments: {
          where: query.status ? { status: query.status } : {},
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            status: true,
            reason: true,
            requiresConfirmation: true,
            createdAt: true,
            updatedAt: true,
            patient: { select: PATIENT_CONTACT_SELECT }
          }
        }
      }
    });

    return {
      scheduleId,
      items: slots.map((slot) => ({
        slot: { id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, status: slot.status },
        appointment: slot.appointments[0] ?? null
      }))
    };
  }

  // ----------------------------------------------------- disponibilite (public)

  async availability(
    scheduleId: string,
    query: AvailabilityQueryDto
  ): Promise<AvailabilityView> {
    const schedule = await this.prisma.appointmentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        affiliation: {
          include: {
            doctorProfile: true,
            facility: { select: { id: true, displayName: true } }
          }
        }
      }
    });

    const isPublished =
      schedule &&
      schedule.status === AppointmentScheduleStatus.ACTIVE &&
      schedule.affiliation.status === FacilityAffiliationStatus.VERIFIED &&
      schedule.affiliation.doctorProfile.verificationStatus === 'VERIFIED' &&
      schedule.affiliation.doctorProfile.isPubliclyListed;

    if (!schedule || !isPublished) {
      // 404 sans reveler l'existence d'un agenda non public.
      throw new NotFoundException('Schedule not found');
    }

    const timezone = schedule.timezone;
    const todayIso = new Date().toISOString().slice(0, 10);
    const resolvedFrom = query.from ?? todayIso;
    const resolvedTo =
      query.to ??
      (() => {
        const [year, month, day] = resolvedFrom.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day + DEFAULT_LOOKAHEAD_DAYS))
          .toISOString()
          .slice(0, 10);
      })();

    if (!isValidDateString(resolvedFrom) || !isValidDateString(resolvedTo)) {
      throw new BadRequestException('Invalid date range');
    }

    const from = zonedDateRange(resolvedFrom, timezone).from;
    const to = zonedDateRange(resolvedTo, timezone).to;
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException('to must be after from');
    }

    const slots = await this.prisma.appointmentSlot.findMany({
      where: {
        scheduleId,
        status: AppointmentSlotStatus.OPEN,
        startsAt: { gte: from, lt: to }
      },
      orderBy: { startsAt: 'asc' }
    });

    return {
      schedule: {
        id: schedule.id,
        affiliationId: schedule.affiliationId,
        timezone,
        visitDurationMinutes: schedule.visitDurationMinutes,
        confirmationMode: schedule.confirmationMode,
        requiresConfirmation:
          schedule.confirmationMode !== AppointmentConfirmationMode.AUTOMATIC
      },
      doctor: {
        id: schedule.affiliation.doctorProfile.id,
        displayName: schedule.affiliation.doctorProfile.displayName
      },
      facility: { id: schedule.affiliation.facility.id, displayName: schedule.affiliation.facility.displayName },
      slots: slots.map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        status: slot.status
      }))
    };
  }

  // ------------------------------------------------------------------ patient

  async book(
    userId: string,
    dto: BookAppointmentDto
  ): Promise<{ id: string; status: AppointmentStatus }> {
    const idempotencyKey = dto.idempotencyKey ?? randomUUID();

    if (dto.idempotencyKey) {
      const existing = await this.prisma.appointment.findUnique({
        where: {
          patientUserId_idempotencyKey: {
            patientUserId: userId,
            idempotencyKey: dto.idempotencyKey
          }
        },
        select: { id: true, status: true }
      });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const slot = await tx.appointmentSlot.findUnique({
        where: { id: dto.slotId },
        include: { schedule: true }
      });

      if (!slot) {
        throw new NotFoundException('Slot not found');
      }
      if (slot.status !== AppointmentSlotStatus.OPEN) {
        throw new ConflictException('This time slot is no longer available');
      }
      if (slot.schedule.status !== AppointmentScheduleStatus.ACTIVE) {
        throw new ConflictException('This schedule is not active');
      }
      if (slot.schedule.confirmationMode === AppointmentConfirmationMode.DISABLED) {
        throw new ConflictException('Online booking is disabled for this schedule');
      }
      if (slot.startsAt.getTime() <= Date.now()) {
        throw new ConflictException('This slot is in the past');
      }

      // Verrouillage pessimiste : seul le premier concurrent fait passer le
      // creneau de OPEN a BOOKED. L'index partiel Appointment_activeSlot_key
      // garantit en derniere ligne de defense un seul rendez-vous actif/creneau.
      const locked = await tx.appointmentSlot.updateMany({
        where: { id: slot.id, status: AppointmentSlotStatus.OPEN },
        data: { status: AppointmentSlotStatus.BOOKED }
      });
      if (locked.count === 0) {
        throw new ConflictException('This time slot was just booked');
      }

      const requiresConfirmation =
        slot.schedule.confirmationMode !== AppointmentConfirmationMode.AUTOMATIC;
      const initialStatus = requiresConfirmation
        ? AppointmentStatus.PENDING
        : AppointmentStatus.CONFIRMED;

      const appointment = await tx.appointment.create({
        data: {
          slotId: slot.id,
          patientUserId: userId,
          reason: dto.reason ?? null,
          requiresConfirmation,
          status: initialStatus,
          idempotencyKey
        },
        select: { id: true }
      });

      await tx.appointmentEvent.create({
        data: {
          appointmentId: appointment.id,
          actorId: userId,
          action: AppointmentEventAction.CREATED,
          fromStatus: null,
          toStatus: initialStatus
        }
      });

      if (!requiresConfirmation) {
        await tx.appointmentEvent.create({
          data: {
            appointmentId: appointment.id,
            actorId: null,
            action: AppointmentEventAction.CONFIRMED,
            fromStatus: AppointmentStatus.PENDING,
            toStatus: AppointmentStatus.CONFIRMED
          }
        });
      }

      return { id: appointment.id, status: initialStatus };
    });

    await this.notifyParticipants(result.id, NotificationType.APPOINTMENT_CREATED, {
      includeDoctor: true
    });
    if (result.status === AppointmentStatus.CONFIRMED) {
      await this.notifyParticipants(result.id, NotificationType.APPOINTMENT_CONFIRMED, {
        includeDoctor: true
      });
    }

    return result;
  }

  async listMine(
    userId: string,
    query: ListAppointmentsQueryDto
  ): Promise<AppointmentView[]> {
    const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined;

    const where: Prisma.AppointmentWhereInput = {
      patientUserId: userId,
      ...(query.status ? { status: query.status } : {}),
      ...(from || to
        ? {
            slot: { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          }
        : {})
    };

    const appointments = await this.prisma.appointment.findMany({
      where,
      select: APPOINTMENT_SELECT,
      orderBy: { createdAt: 'desc' }
    });

    return Promise.all(appointments.map((a) => this.toAppointmentView(a, true)));
  }

  async getAppointment(
    userId: string,
    appointmentId: string,
    isAdmin: boolean
  ): Promise<AppointmentView> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        ...APPOINTMENT_SELECT,
        events: { orderBy: { createdAt: 'asc' } }
      }
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const isDoctor = appointment.slot.schedule.affiliation.doctorProfile.userId === userId;
    if (
      appointment.patientUserId !== userId &&
      !isDoctor &&
      !isAdmin
    ) {
      throw new ForbiddenException('Not allowed to view this appointment');
    }

    return this.toAppointmentView(appointment, true);
  }

  async cancel(
    userId: string,
    appointmentId: string,
    dto: CancelAppointmentDto
  ): Promise<{ id: string; status: AppointmentStatus }> {
    const id = await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        select: { id: true, status: true, patientUserId: true, slotId: true }
      });
      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }
      if (appointment.patientUserId !== userId) {
        throw new ForbiddenException('Only the patient can cancel this appointment');
      }
      if (
        appointment.status !== AppointmentStatus.PENDING &&
        appointment.status !== AppointmentStatus.CONFIRMED
      ) {
        throw new ConflictException('This appointment cannot be cancelled');
      }

      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: AppointmentStatus.CANCELLED }
      });
      await tx.appointmentEvent.create({
        data: {
          appointmentId,
          actorId: userId,
          action: AppointmentEventAction.CANCELLED,
          fromStatus: appointment.status,
          toStatus: AppointmentStatus.CANCELLED,
          reason: dto.reason?.trim() || null
        }
      });
      // Le creneau redevient proposable.
      await tx.appointmentSlot.update({
        where: { id: appointment.slotId },
        data: { status: AppointmentSlotStatus.OPEN }
      });
      return appointmentId;
    });

    await this.notifyParticipants(id, NotificationType.APPOINTMENT_CANCELLED, {
      includeDoctor: true
    });

    return { id, status: AppointmentStatus.CANCELLED };
  }

  // ------------------------------------------------- decider (praticien)

  async decide(
    userId: string,
    appointmentId: string,
    dto: DecideAppointmentDto
  ): Promise<{ id: string; status: AppointmentStatus }> {
    type Transition = {
      from: AppointmentStatus[];
      to: AppointmentStatus;
      event: AppointmentEventAction;
      reopenSlot: boolean;
      requiresReason: boolean;
    };

    const transition: Transition =
      dto.action === 'CONFIRM'
        ? {
            from: [AppointmentStatus.PENDING],
            to: AppointmentStatus.CONFIRMED,
            event: AppointmentEventAction.CONFIRMED,
            reopenSlot: false,
            requiresReason: false
          }
        : dto.action === 'REJECT'
          ? {
              from: [AppointmentStatus.PENDING],
              to: AppointmentStatus.CANCELLED,
              event: AppointmentEventAction.REJECTED,
              reopenSlot: true,
              requiresReason: true
            }
          : dto.action === 'COMPLETE'
            ? {
                from: [AppointmentStatus.CONFIRMED],
                to: AppointmentStatus.COMPLETED,
                event: AppointmentEventAction.COMPLETED,
                reopenSlot: false,
                requiresReason: false
              }
            : {
                from: [AppointmentStatus.CONFIRMED],
                to: AppointmentStatus.NO_SHOW,
                event: AppointmentEventAction.NO_SHOW_MARKED,
                reopenSlot: false,
                requiresReason: false
              };

    await this.prisma.$transaction(async (tx) => {
      const appointment = await tx.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          slot: {
            include: {
              schedule: {
                include: {
                  affiliation: {
                    include: {
                      doctorProfile: { select: { userId: true } },
                      facility: {
                        select: { id: true, managers: { select: { userId: true } } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      if (!appointment) {
        throw new NotFoundException('Appointment not found');
      }
      const affiliation = appointment.slot.schedule.affiliation;
      const isDoctorOwner = affiliation.doctorProfile.userId === userId;
      const isFacilityManager =
        affiliation.facility?.managers?.some((manager) => manager.userId === userId) ??
        false;
      if (!isDoctorOwner && !isFacilityManager) {
        throw new ForbiddenException('You do not manage this appointment');
      }
      if (!transition.from.includes(appointment.status)) {
        throw new ConflictException(
          `Cannot ${dto.action} an appointment in status ${appointment.status}`
        );
      }
      if (transition.requiresReason && !dto.reason?.trim()) {
        throw new BadRequestException('A reason is required for this decision');
      }

      await tx.appointment.update({
        where: { id: appointmentId },
        data: { status: transition.to }
      });
      await tx.appointmentEvent.create({
        data: {
          appointmentId,
          actorId: userId,
          action: transition.event,
          fromStatus: appointment.status,
          toStatus: transition.to,
          reason: dto.reason?.trim() || null
        }
      });
      if (transition.reopenSlot) {
        await tx.appointmentSlot.update({
          where: { id: appointment.slotId },
          data: { status: AppointmentSlotStatus.OPEN }
        });
      }
    });

    const notificationType = this.notificationTypeForEvent(transition.event);
    if (notificationType) {
      const includeDoctor =
        transition.event === AppointmentEventAction.CONFIRMED ||
        transition.event === AppointmentEventAction.REJECTED;
      await this.notifyParticipants(appointmentId, notificationType, { includeDoctor });
    }

    return { id: appointmentId, status: transition.to };
  }

  // ---------------------------------------------------- relation de soins

  // Jour 8 : relation de soins verifiable entre un praticien et un patient.
  // Elle repose uniquement sur un rendez-vous CONFIRMED ou COMPLETED du
  // praticien pour ce patient. Aucune relation n'est inventee : sans rendez-
  // vous dans l'historique, pas d'autorisation clinique deduite.
  async hasCareRelationship(
    doctorUserId: string,
    patientUserId: string
  ): Promise<boolean> {
    const count = await this.prisma.appointment.count({
      where: {
        patientUserId,
        status: {
          in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED]
        },
        slot: {
          schedule: {
            affiliation: {
              doctorProfile: { userId: doctorUserId }
            }
          }
        }
      }
    });
    return count > 0;
  }

  // Verifie qu'un rendez-vous precis lie effectivement ce praticien a ce
  // patient (meme base : CONFIRMED ou COMPLETED). Sert a rattacher une
  // consultation a un rendez-vous existant sans s'y fier aveuglement.
  async isCareAppointment(
    doctorUserId: string,
    patientUserId: string,
    appointmentId: string
  ): Promise<boolean> {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        patientUserId,
        status: {
          in: [AppointmentStatus.CONFIRMED, AppointmentStatus.COMPLETED]
        },
        slot: {
          schedule: {
            affiliation: {
              doctorProfile: { userId: doctorUserId }
            }
          }
        }
      },
      select: { id: true }
    });
    return appointment !== null;
  }

  // ---------------------------------------------------------------- helpers

  private async assertAffiliationOwner(
    userId: string,
    affiliationId: string
  ): Promise<{
    id: string;
    doctorProfile: { id: string; displayName: string; userId: string };
    facility: { id: string; displayName: string };
  }> {
    const affiliation = await this.prisma.doctorFacilityAffiliation.findUnique({
      where: { id: affiliationId },
      include: {
        doctorProfile: { select: { id: true, displayName: true, userId: true } },
        facility: {
          select: {
            id: true,
            displayName: true,
            managers: { select: { userId: true } }
          }
        }
      }
    });
    if (!affiliation) {
      throw new NotFoundException('Affiliation not found');
    }
    const isDoctorOwner = affiliation.doctorProfile.userId === userId;
    const isFacilityManager =
      affiliation.facility.managers?.some((manager) => manager.userId === userId) ??
      false;
    if (!isDoctorOwner && !isFacilityManager) {
      throw new ForbiddenException('You do not own this affiliation');
    }
    if (affiliation.status !== FacilityAffiliationStatus.VERIFIED) {
      throw new ConflictException('A verified affiliation is required');
    }
    return affiliation;
  }

  private async assertScheduleOwner(
    userId: string,
    scheduleId: string
  ): Promise<{
    id: string;
    affiliationId: string;
    timezone: string;
    visitDurationMinutes: number;
    confirmationMode: AppointmentConfirmationMode;
    status: AppointmentScheduleStatus;
    affiliation: {
      id: string;
      doctorProfile: { id: string; displayName: string; userId: string };
      facility: { id: string; displayName: string };
    };
  }> {
    const schedule = await this.prisma.appointmentSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        affiliation: {
          include: {
            doctorProfile: { select: { id: true, displayName: true, userId: true } },
            facility: {
              select: {
                id: true,
                displayName: true,
                managers: { select: { userId: true } }
              }
            }
          }
        }
      }
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }
    const isDoctorOwner = schedule.affiliation.doctorProfile.userId === userId;
    const isFacilityManager =
      schedule.affiliation.facility.managers?.some(
        (manager) => manager.userId === userId
      ) ?? false;
    if (!isDoctorOwner && !isFacilityManager) {
      throw new ForbiddenException('You do not manage this schedule');
    }
    return schedule;
  }

  // Traduit les deux representations (booleen historique et mode explicite) en
  // un mode unique. Fournir les deux de facon contradictoire est une erreur.
  private resolveConfirmationMode(
    dto: UpdateScheduleDto
  ): AppointmentConfirmationMode | undefined {
    if (dto.confirmationMode !== undefined && dto.requiresConfirmation !== undefined) {
      const fromBoolean = dto.requiresConfirmation
        ? AppointmentConfirmationMode.MANUAL
        : AppointmentConfirmationMode.AUTOMATIC;
      if (fromBoolean !== dto.confirmationMode) {
        throw new BadRequestException(
          'requiresConfirmation and confirmationMode are inconsistent'
        );
      }
      return dto.confirmationMode;
    }
    if (dto.confirmationMode !== undefined) {
      return dto.confirmationMode;
    }
    if (dto.requiresConfirmation !== undefined) {
      return dto.requiresConfirmation
        ? AppointmentConfirmationMode.MANUAL
        : AppointmentConfirmationMode.AUTOMATIC;
    }
    return undefined;
  }

  private scheduleSnapshot(schedule: {
    timezone: string;
    visitDurationMinutes: number;
    confirmationMode: AppointmentConfirmationMode;
    status: AppointmentScheduleStatus;
  }): Prisma.InputJsonValue {
    return {
      timezone: schedule.timezone,
      visitDurationMinutes: schedule.visitDurationMinutes,
      confirmationMode: schedule.confirmationMode,
      status: schedule.status
    };
  }

  private notificationTypeForEvent(
    action: AppointmentEventAction
  ): NotificationType | null {
    switch (action) {
      case AppointmentEventAction.CONFIRMED:
        return NotificationType.APPOINTMENT_CONFIRMED;
      case AppointmentEventAction.REJECTED:
        return NotificationType.APPOINTMENT_REJECTED;
      case AppointmentEventAction.COMPLETED:
        return NotificationType.APPOINTMENT_COMPLETED;
      case AppointmentEventAction.NO_SHOW_MARKED:
        return NotificationType.APPOINTMENT_NO_SHOW;
      case AppointmentEventAction.CANCELLED:
        return NotificationType.APPOINTMENT_CANCELLED;
      default:
        return null;
    }
  }

  // Depose les notifications liees a un rendez-vous dans la file d'envoi. Les
  // notifications ne doivent JAMAIS compromettre une operation metier : toute
  // erreur est avalee. Le payload ne contient aucune donnee sensible (jamais le
  // motif du patient).
  private async notifyParticipants(
    appointmentId: string,
    type: NotificationType,
    options: { includeDoctor?: boolean } = {}
  ): Promise<void> {
    try {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          patientUserId: true,
          status: true,
          slot: {
            select: {
              startsAt: true,
              schedule: {
                select: {
                  affiliation: {
                    select: {
                      doctorProfile: { select: { userId: true, displayName: true } },
                      facility: { select: { displayName: true } }
                    }
                  }
                }
              }
            }
          }
        }
      });
      if (!appointment) {
        return;
      }

      const doctor = appointment.slot.schedule.affiliation.doctorProfile;
      const payload: Prisma.InputJsonValue = {
        appointmentId,
        status: appointment.status,
        startsAt: appointment.slot.startsAt.toISOString(),
        doctorName: doctor.displayName,
        facilityName: appointment.slot.schedule.affiliation.facility.displayName
      };

      const recipients = new Set<string>([appointment.patientUserId]);
      if (options.includeDoctor) {
        recipients.add(doctor.userId);
      }

      for (const recipientUserId of recipients) {
        await this.notifications.enqueue({
          type,
          recipientUserId,
          appointmentId,
          payload,
          dedupeKey: `${type}:${appointmentId}:${recipientUserId}`
        });
      }
    } catch {
      // Volontairement silencieux : la tracabilite des rendez-vous prime.
    }
  }

  private async toScheduleView(
    schedule: {
      id: string;
      affiliationId: string;
      timezone: string;
      visitDurationMinutes: number;
      confirmationMode: AppointmentConfirmationMode;
      status: AppointmentScheduleStatus;
      createdAt: Date;
      updatedAt: Date;
    },
    affiliation: {
      doctorProfile: { id: string; displayName: string };
      facility: { id: string; displayName: string };
    }
  ): Promise<ScheduleView> {
    return {
      id: schedule.id,
      affiliationId: schedule.affiliationId,
      timezone: schedule.timezone,
      visitDurationMinutes: schedule.visitDurationMinutes,
      confirmationMode: schedule.confirmationMode,
      requiresConfirmation:
        schedule.confirmationMode !== AppointmentConfirmationMode.AUTOMATIC,
      status: schedule.status,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
      doctor: affiliation.doctorProfile,
      facility: affiliation.facility
    };
  }

  private async toAppointmentView(
    appointment: AppointmentSelectPayload & {
      events?: {
        id: string;
        action: AppointmentEventAction;
        fromStatus: AppointmentStatus | null;
        toStatus: AppointmentStatus | null;
        reason: string | null;
        createdAt: Date;
        actorId: string | null;
      }[];
    },
    withEvents: boolean
  ): Promise<AppointmentView> {
    const events = appointment.events ?? [];
    return {
      id: appointment.id,
      status: appointment.status,
      reason: appointment.reason,
      requiresConfirmation: appointment.requiresConfirmation,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      slot: {
        id: appointment.slot.id,
        startsAt: appointment.slot.startsAt,
        endsAt: appointment.slot.endsAt,
        status: appointment.slot.status
      },
      schedule: {
        id: appointment.slot.schedule.id,
        timezone: appointment.slot.schedule.timezone,
        affiliationId: appointment.slot.schedule.affiliationId
      },
      doctor: {
        id: appointment.slot.schedule.affiliation.doctorProfile.id,
        displayName: appointment.slot.schedule.affiliation.doctorProfile.displayName
      },
      facility: {
        id: appointment.slot.schedule.affiliation.facility.id,
        displayName: appointment.slot.schedule.affiliation.facility.displayName
      },
      patient: appointment.patient,
      events: withEvents
        ? events.map((event) => ({
            id: event.id,
            action: event.action,
            fromStatus: event.fromStatus,
            toStatus: event.toStatus,
            reason: event.reason,
            createdAt: event.createdAt,
            actorId: event.actorId
          }))
        : []
    };
  }
}