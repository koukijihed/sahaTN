import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  NotificationDispatchResult,
  NotificationsService
} from './notifications.service';

@ApiTags('admin-notifications')
@ApiUnauthorizedResponse({ description: 'Non authentifie' })
@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('admin')
export class NotificationsAdminController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('notifications')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Lister la file d\'envoi des notifications (admin)' })
  list(@Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.listAll({
      status: query.status,
      limit: query.limit ?? 50
    });
  }

  @Post('notifications/dispatch')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Declencher l\'envoi des notifications dues (admin)' })
  dispatch(): Promise<NotificationDispatchResult> {
    return this.notificationsService.dispatchDue();
  }
}
