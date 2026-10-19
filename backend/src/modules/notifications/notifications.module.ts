import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NOTIFICATION_CHANNEL_ADAPTER } from './notification-channel.adapter';
import { NoopNotificationAdapter } from './noop-notification.adapter';
import { NotificationsAdminController } from './notifications.admin.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController, NotificationsAdminController],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATION_CHANNEL_ADAPTER,
      useClass: NoopNotificationAdapter
    }
  ],
  exports: [NotificationsService]
})
export class NotificationsModule {}
