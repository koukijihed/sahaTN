import { NotificationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationChannelAdapter,
  NotificationDeliveryResult
} from './notification-channel.adapter';
import { NotificationsService } from './notifications.service';

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif1',
    type: 'APPOINTMENT_CREATED',
    channel: 'EMAIL',
    recipientUserId: 'patient1',
    appointmentId: 'appt1',
    payload: { appointmentId: 'appt1' },
    status: NotificationStatus.PENDING,
    attempts: 0,
    dedupeKey: 'APPOINTMENT_CREATED:appt1:patient1',
    scheduledFor: null,
    lastAttemptAt: null,
    sentAt: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function createMockPrisma() {
  return {
    notificationOutbox: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn()
    }
  };
}

function createAdapter(
  result: NotificationDeliveryResult
): NotificationChannelAdapter {
  return {
    channel: 'EMAIL' as NotificationChannelAdapter['channel'],
    send: jest.fn().mockResolvedValue(result)
  };
}

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof createMockPrisma>;
  let adapter: NotificationChannelAdapter;
  let service: NotificationsService;

  beforeEach(() => {
    prisma = createMockPrisma();
    adapter = createAdapter({ status: NotificationStatus.SKIPPED });
    service = new NotificationsService(
      prisma as unknown as PrismaService,
      adapter
    );
  });

  describe('enqueue', () => {
    it('deposits a message in the outbox keyed by dedupeKey', async () => {
      prisma.notificationOutbox.upsert.mockResolvedValue({
        id: 'notif1',
        status: NotificationStatus.PENDING
      });

      const result = await service.enqueue({
        type: 'APPOINTMENT_CREATED',
        recipientUserId: 'patient1',
        appointmentId: 'appt1',
        dedupeKey: 'APPOINTMENT_CREATED:appt1:patient1',
        payload: { appointmentId: 'appt1' }
      });

      expect(result).toEqual({ id: 'notif1', status: 'PENDING' });
      expect(prisma.notificationOutbox.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dedupeKey: 'APPOINTMENT_CREATED:appt1:patient1' },
          update: {},
          create: expect.objectContaining({
            type: 'APPOINTMENT_CREATED',
            recipientUserId: 'patient1',
            appointmentId: 'appt1'
          })
        })
      );
    });
  });

  describe('dispatchDue', () => {
    it('never claims a send the adapter skipped', async () => {
      prisma.notificationOutbox.findMany.mockResolvedValue([entry()]);
      prisma.notificationOutbox.update.mockResolvedValue({});

      const result = await service.dispatchDue(new Date('2026-01-01T00:00:00Z'));

      expect(result).toEqual({ processed: 1, sent: 0, failed: 0, skipped: 1 });
      expect(prisma.notificationOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'notif1' },
          data: expect.objectContaining({
            status: NotificationStatus.SKIPPED,
            attempts: { increment: 1 },
            sentAt: null
          })
        })
      );
    });

    it('marks a message SENT only when the adapter confirms delivery', async () => {
      adapter = createAdapter({ status: NotificationStatus.SENT });
      service = new NotificationsService(
        prisma as unknown as PrismaService,
        adapter
      );
      prisma.notificationOutbox.findMany.mockResolvedValue([entry()]);
      prisma.notificationOutbox.update.mockResolvedValue({});

      const now = new Date('2026-01-01T00:00:00Z');
      const result = await service.dispatchDue(now);

      expect(result.sent).toBe(1);
      expect(prisma.notificationOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: NotificationStatus.SENT,
            sentAt: now
          })
        })
      );
    });

    it('records FAILED when the adapter throws', async () => {
      adapter = {
        channel: 'EMAIL' as NotificationChannelAdapter['channel'],
        send: jest.fn().mockRejectedValue(new Error('boom'))
      };
      service = new NotificationsService(
        prisma as unknown as PrismaService,
        adapter
      );
      prisma.notificationOutbox.findMany.mockResolvedValue([entry()]);
      prisma.notificationOutbox.update.mockResolvedValue({});

      const result = await service.dispatchDue();

      expect(result).toEqual({ processed: 1, sent: 0, failed: 1, skipped: 0 });
      expect(prisma.notificationOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: NotificationStatus.FAILED,
            error: 'boom'
          })
        })
      );
    });

    it('does nothing when no message is due', async () => {
      prisma.notificationOutbox.findMany.mockResolvedValue([]);
      const result = await service.dispatchDue();
      expect(result).toEqual({ processed: 0, sent: 0, failed: 0, skipped: 0 });
      expect(prisma.notificationOutbox.update).not.toHaveBeenCalled();
    });
  });
});
