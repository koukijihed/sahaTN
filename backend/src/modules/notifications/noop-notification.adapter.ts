import { Injectable } from '@nestjs/common';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import {
  NotificationChannelAdapter,
  NotificationDeliveryResult
} from './notification-channel.adapter';

// Adaptateur par defaut : aucun fournisseur reel n'est branche a ce stade.
// Il ne fait jamais croire a un envoi : le message est marque SKIPPED, ce qui
// est distinct d'un echec (FAILED) et n'affirme aucune transmission.
@Injectable()
export class NoopNotificationAdapter implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;

  async send(): Promise<NotificationDeliveryResult> {
    return { status: NotificationStatus.SKIPPED };
  }
}
