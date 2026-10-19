import { NotificationOutbox, NotificationChannel, NotificationStatus } from '@prisma/client';

export const NOTIFICATION_CHANNEL_ADAPTER = Symbol('NOTIFICATION_CHANNEL_ADAPTER');

export interface NotificationDeliveryResult {
  // SENT = transmis avec preuve ; SKIPPED = volontairement non transmis
  // (aucun canal reel branche) ; FAILED = echec d'envoi.
  status: NotificationStatus;
  error?: string;
}

// Adaptateur de canal : seul responsable de la transmission reelle. Le domaine
// des rendez-vous n'ecrit jamais dans un canal directement.
export interface NotificationChannelAdapter {
  readonly channel: NotificationChannel;
  send(entry: NotificationOutbox): Promise<NotificationDeliveryResult>;
}
