import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import {
  AppointmentView,
  AppointmentsService,
  AvailabilityView,
  ScheduleAppointmentView,
  ScheduleView
} from './appointments.service';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { CancelAppointmentDto } from './dto/cancel-appointment.dto';
import { DecideAppointmentDto } from './dto/decide-appointment.dto';
import { GenerateSlotsDto } from './dto/generate-slots.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments-query.dto';
import { ListScheduleAppointmentsQueryDto } from './dto/list-schedule-appointments-query.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

@ApiTags('appointments')
@Controller('appointments/schedules')
export class AppointmentSchedulesController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get(':affiliationId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Agenda de mon affiliation (praticien)' })
  getScheduleByAffiliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('affiliationId') affiliationId: string
  ): Promise<ScheduleView> {
    return this.appointmentsService.getScheduleByAffiliation(user!.id, affiliationId);
  }

  @Put(':affiliationId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Creer ou modifier l\'agenda d\'une affiliation (praticien)' })
  upsertSchedule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('affiliationId') affiliationId: string,
    @Body() dto: UpdateScheduleDto
  ): Promise<ScheduleView> {
    return this.appointmentsService.upsertSchedule(user!.id, affiliationId, dto);
  }

  @Post(':scheduleId/slots/generate')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generer les creneaux OUVERTS d\'une journee (praticien)' })
  generateSlots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: GenerateSlotsDto
  ): Promise<{ created: number; skipped: number; date: string }> {
    return this.appointmentsService.generateSlots(user!.id, scheduleId, dto);
  }

  @Delete(':scheduleId/slots/:slotId')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Supprimer un creneau encore ouvert (praticien)' })
  deleteSlot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scheduleId') scheduleId: string,
    @Param('slotId') slotId: string
  ): Promise<{ id: string; deleted: boolean }> {
    return this.appointmentsService.deleteSlot(user!.id, scheduleId, slotId);
  }

  @Get(':scheduleId/appointments')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Creneaux et rendez-vous d\'un agenda (praticien)' })
  listScheduleAppointments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scheduleId') scheduleId: string,
    @Query() query: ListScheduleAppointmentsQueryDto
  ): Promise<{ scheduleId: string; items: ScheduleAppointmentView[] }> {
    return this.appointmentsService.listScheduleAppointments(
      user!.id,
      scheduleId,
      query
    );
  }

  @Get(':scheduleId/availability')
  @ApiOperation({ summary: 'Disponibilites publiques d\'un agenda' })
  @ApiNotFoundResponse({ description: 'Agenda inconnu ou non public' })
  availability(
    @Param('scheduleId') scheduleId: string,
    @Query() query: AvailabilityQueryDto
  ): Promise<AvailabilityView> {
    return this.appointmentsService.availability(scheduleId, query);
  }
}

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reserver un creneau (patient) ; rejouable via idempotencyKey'
  })
  book(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BookAppointmentDto
  ): Promise<{ id: string; status: string }> {
    return this.appointmentsService.book(user!.id, dto);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Mes rendez-vous (patient)' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAppointmentsQueryDto
  ): Promise<AppointmentView[]> {
    return this.appointmentsService.listMine(user!.id, query);
  }

  @Get(':id')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Detail d\'un rendez-vous (patient, praticien ou admin)' })
  getAppointment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string
  ): Promise<AppointmentView> {
    return this.appointmentsService.getAppointment(
      user!.id,
      id,
      user!.roles.includes(Role.ADMIN)
    );
  }

  @Post(':id/cancel')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler un rendez-vous (patient)' })
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelAppointmentDto
  ): Promise<{ id: string; status: string }> {
    return this.appointmentsService.cancel(user!.id, id, dto);
  }

  @Post(':id/decide')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decision du praticien sur un rendez-vous (confirmation, refus, cloture)'
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideAppointmentDto
  ): Promise<{ id: string; status: string }> {
    return this.appointmentsService.decide(user!.id, id, dto);
  }
}