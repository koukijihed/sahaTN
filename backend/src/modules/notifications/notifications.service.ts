import { Inject, Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NOTIFICATION_CHANNEL_ADAPTER,
  NotificationChannelAdapter
} from './notification-channel.adapter';

export interface EnqueueNotificationInput {
  type: NotificationType;
  recipientUserId: string;
  dedupeKey: string;
  payload: Prisma.InputJsonValue;
  channel?: NotificationChannel;
  appointmentId?: string | null;
  scheduledFor?: Date | null;
}

export interface NotificationDispatchResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface NotificationView {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  appointmentId: string | null;
  payload: Prisma.JsonValue;
  scheduledFor: Date | null;
  sentAt: Date | null;
  createdAt: Date;
}

const MAX_DISPATCH_BATCH = 100;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_CHANNEL_ADAPTER)
    private readonly adapter: NotificationChannelAdapter
  ) {}

  // Deposer un message dans la file d'envoi. Idempotent : rejouer la meme
  // `dedupeKey` ne cree pas de doublon et renvoie l'entree existante.
  async enqueue(input: EnqueueNotificationInput): Promise<{ id: string; status: NotificationStatus }> {
    const entry = await this.prisma.notificationOutbox.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: {
        type: input.type,
        channel: input.channel ?? NotificationChannel.EMAIL,
        recipientUserId: input.recipientUserId,
        appointmentId: input.appointmentId ?? null,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
        scheduledFor: input.scheduledFor ?? null
      },
      select: { id: true, status: true }
    });
    return entry;
  }

  async listForUser(userId: string, limit = 50): Promise<NotificationView[]> {
    return this.prisma.notificationOutbox.findMany({
      where: { recipientUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        appointmentId: true,
        payload: true,
        scheduledFor: true,
        sentAt: true,
        createdAt: true
      }
    });
  }

  async listAll(options: {
    status?: NotificationStatus;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      type: NotificationType;
      channel: NotificationChannel;
      status: NotificationStatus;
      recipientUserId: string;
      appointmentId: string | null;
      attempts: number;
      dedupeKey: string;
      scheduledFor: Date | null;
      lastAttemptAt: Date | null;
      sentAt: Date | null;
      error: string | null;
      createdAt: Date;
    }>
  > {
    return this.prisma.notificationOutbox.findMany({
      where: options.status ? { status: options.status } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(options.limit ?? 50, 1), 200),
      select: {
        id: true,
        type: true,
        channel: true,
        status: true,
        recipientUserId: true,
        appointmentId: true,
        attempts: true,
        dedupeKey: true,
        scheduledFor: true,
        lastAttemptAt: true,
        sentAt: true,
        error: true,
        createdAt: true
      }
    });
  }

  // Traiter les messages en attente dont l'echeance est atteinte. Chaque envoi
  // passe par l'adaptateur de canal ; le statut resulte de sa reponse, jamais
  // d'une supposition du service.
  async dispatchDue(now: Date = new Date()): Promise<NotificationDispatchResult> {
    const due = await this.prisma.notificationOutbox.findMany({
      where: {
        status: NotificationStatus.PENDING,
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }]
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_DISPATCH_BATCH
    });

    const result: NotificationDispatchResult = {
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0
    };

    for (const entry of due) {
      result.processed += 1;
      let delivery;
      try {
        delivery = await this.adapter.send(entry);
      } catch (error) {
        delivery = {
          status: NotificationStatus.FAILED,
          error: error instanceof Error ? error.message : 'Unknown delivery error'
        } as const;
      }

      if (delivery.status === NotificationStatus.SENT) {
        result.sent += 1;
      } else if (delivery.status === NotificationStatus.FAILED) {
        result.failed += 1;
      } else {
        result.skipped += 1;
      }

      await this.prisma.notificationOutbox.update({
        where: { id: entry.id },
        data: {
          status: delivery.status,
          attempts: { increment: 1 },
          lastAttemptAt: now,
          sentAt: delivery.status === NotificationStatus.SENT ? now : null,
          error: delivery.error ?? null
        }
      });
    }

    return result;
  }
}
