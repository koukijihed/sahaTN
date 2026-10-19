import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const VALID_PASSWORD = 'Passw0rd!2345';

function uniqueEmail(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}@example.tn`;
}

function readCookie(
  setCookie: string | string[] | undefined,
  name: string
): string | undefined {
  if (!setCookie) {
    return undefined;
  }
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const entry = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1).split(';')[0] : undefined;
}

function futureDateString(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

interface Session {
  userId: string;
  email: string;
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

const VALID_FACILITY = {
  displayName: 'Clinique Etoile',
  officialName: 'Clinique Etoile Tunis',
  description: 'Etablissement prive de test.',
  sector: 'PRIVATE',
  type: 'PRIVATE_CLINIC',
  licenseReference: 'LIC-APPT-0001',
  sourceReference: 'ANN-APPT-0001',
  addressLine: '2 Rue des Fleurs',
  city: 'Tunis',
  governorate: 'TUNIS',
  delegation: 'Tunis Ville',
  postalCode: '1002',
  phone: '+216 70 111 111',
  websiteUrl: 'https://etoile.example.tn'
};

interface FacilityRef {
  facility: { id: string };
  manager: Session;
}

describe('Appointments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();

  async function createUserAndSession(prefix: string): Promise<Session> {
    const email = uniqueEmail(prefix);
    const registerResponse = await request(server())
      .post('/api/auth/register')
      .send({ email, password: VALID_PASSWORD })
      .expect(201);
    const agent = request.agent(server());
    const login = await agent
      .post('/api/auth/login')
      .send({ email, password: VALID_PASSWORD })
      .expect(200);
    const csrf = readCookie(login.headers['set-cookie'], 'sahatn_csrf');
    expect(csrf).toBeDefined();
    return {
      userId: registerResponse.body.id as string,
      email,
      agent,
      csrf: csrf as string
    };
  }

  function mutate(
    session: Session,
    method: 'post' | 'put' | 'patch' | 'delete',
    url: string
  ) {
    return session.agent[method](url).set('x-csrf-token', session.csrf);
  }

  async function promoteToAdmin(userId: string) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId, role: Role.ADMIN } },
      update: {},
      create: { userId, role: Role.ADMIN }
    });
  }

  async function createAdmin(prefix: string) {
    const admin = await createUserAndSession(prefix);
    await promoteToAdmin(admin.userId);
    return admin;
  }

  async function seedSpecialty(name = 'Cardiologie') {
    const stamp = Date.now();
    return prisma.specialty.create({
      data: { code: `CAR-${stamp}`, labelFr: `${name} ${stamp}` }
    });
  }

  async function createVerifiedDoctor(
    prefix: string,
    specialtyId: string
  ): Promise<Session> {
    const doctor = await createUserAndSession(prefix);
    await mutate(doctor, 'put', '/api/doctors/me')
      .send({
        displayName: `Dr zz ${prefix}`,
        professionalDescription: 'Praticien teste.',
        languages: ['fr', 'ar'],
        yearsOfExperience: 6,
        specialtyIds: [specialtyId]
      })
      .expect(200);
    await mutate(doctor, 'post', '/api/doctors/me/credentials')
      .send({ type: 'DIPLOMA', issuingBody: 'Faculte de medecine de Tunis' })
      .expect(201);
    await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);
    const requestRow = await prisma.doctorVerificationRequest.findFirst({
      where: { doctorProfile: { userId: doctor.userId } },
      orderBy: { createdAt: 'desc' }
    });
    expect(requestRow).not.toBeNull();
    const admin = await createAdmin(`${prefix}_admin`);
    const requestId = (requestRow as { id: string }).id;
    await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${requestId}/decision`
    )
      .send({ action: 'START_REVIEW' })
      .expect(200);
    await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${requestId}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);
    await mutate(doctor, 'put', '/api/doctors/me/visibility')
      .send({ listed: true })
      .expect(200);
    return doctor;
  }

  async function createVerifiedFacility(prefix: string): Promise<FacilityRef> {
    const creator = await createUserAndSession(`${prefix}_creator`);
    const created = await mutate(creator, 'post', '/api/facilities')
      .send(VALID_FACILITY)
      .expect(201);
    const admin = await createAdmin(`${prefix}_admin`);
    await mutate(admin, 'post', `/api/admin/facilities/${created.body.id}/managers`)
      .send({ userId: creator.userId })
      .expect(201);
    await mutate(creator, 'post', `/api/facilities/${created.body.id}/verification`)
      .send({ submit: true })
      .expect(201);
    await mutate(admin, 'post', `/api/admin/facilities/${created.body.id}/decision`)
      .send({ action: 'START_REVIEW' })
      .expect(200);
    await mutate(admin, 'post', `/api/admin/facilities/${created.body.id}/decision`)
      .send({ action: 'APPROVE' })
      .expect(200);
    return { facility: { id: created.body.id as string }, manager: creator };
  }

  interface AppointmentContext {
    doctor: Session;
    facilityManager: Session;
    affiliationId: string;
    scheduleId: string;
    facilityId: string;
  }

  async function setupAppointmentContext(prefix: string): Promise<AppointmentContext> {
    const specialty = await seedSpecialty();
    const ref = await createVerifiedFacility(prefix);
    const doctor = await createVerifiedDoctor(`${prefix}_doctor`, specialty.id);
    const requestAff = await mutate(
      doctor,
      'post',
      `/api/facilities/${ref.facility.id}/affiliations`
    ).expect(201);
    const affiliationId = requestAff.body.id as string;
    const admin = await createAdmin(`${prefix}_affadmin`);
    await mutate(
      admin,
      'post',
      `/api/admin/facility-affiliations/${affiliationId}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);

    const schedule = await mutate(
      doctor,
      'put',
      `/api/appointments/schedules/${affiliationId}`
    )
      .send({ requiresConfirmation: true, visitDurationMinutes: 30 })
      .expect(200);

    return {
      doctor,
      facilityManager: ref.manager,
      affiliationId,
      scheduleId: schedule.body.id as string,
      facilityId: ref.facility.id
    };
  }

  it('1. only the affiliated doctor can create and configure a schedule', async () => {
    const ctx = await setupAppointmentContext('appt1');
    const schedule = await ctx.doctor.agent
      .get(`/api/appointments/schedules/${ctx.affiliationId}`)
      .expect(200);
    expect(schedule.body.id).toBe(ctx.scheduleId);
    expect(schedule.body.requiresConfirmation).toBe(true);

    const stranger = await createUserAndSession('appt1_stranger');
    await mutate(
      stranger,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ requiresConfirmation: false })
      .expect(403);

    await mutate(
      ctx.doctor,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ visitDurationMinutes: 30, unexpectedField: true })
      .expect(400);
  });

  it('2. slot generation is idempotent and non-overlapping', async () => {
    const ctx = await setupAppointmentContext('appt2');
    const date = futureDateString(3);

    const first = await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '11:00' })
      .expect(201);
    expect(first.body.created).toBe(4); // 09:00, 09:30, 10:00, 10:30
    expect(first.body.skipped).toBe(0);

    const replay = await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '11:00' })
      .expect(201);
    expect(replay.body.created).toBe(0);
    expect(replay.body.skipped).toBe(4);

    const availability = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);
    expect(availability.body.slots).toHaveLength(4);
    expect(availability.body.doctor.displayName).toBeDefined();
  });

  it('3. replaceExisting regenerates the day and refuses when booked', async () => {
    const ctx = await setupAppointmentContext('appt3');
    const date = futureDateString(4);

    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '10:00' })
      .expect(201);

    const availability = await request(server())
      .get(
        `/api/appointments/schedules/${ctx.scheduleId}/availability?from=${date}&to=${date}`
      )
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;

    const patient = await createUserAndSession('appt3_patient');
    await mutate(patient, 'post', '/api/appointments')
      .send({ slotId, reason: 'Consultation' })
      .expect(201);

    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '15:00', replaceExisting: true })
      .expect(409);

    const replaced = await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '14:00', endTime: '15:00', replaceExisting: true })
      .expect(201);
    expect(replaced.body.created).toBe(2);
    expect(replaced.body.skipped).toBe(0);
  });

  it('4. a full lifecycle: book, conflict, cancel, rebook, decide', async () => {
    const ctx = await setupAppointmentContext('appt4');
    const date = futureDateString(5);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '10:00' })
      .expect(201);

    const availability1 = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);
    expect(availability1.body.slots).toHaveLength(2);
    const slotId = (availability1.body.slots as { id: string }[])[0].id;

    const patient = await createUserAndSession('appt4_patient');
    const booked = await mutate(patient, 'post', '/api/appointments')
      .send({ slotId, reason: 'Douleur au genou', idempotencyKey: 'replay-1' })
      .expect(201);
    expect(booked.body.status).toBe('PENDING');

    // Double reservation impossible ; rejouer la meme cle renvoie le meme rdv.
    await mutate(patient, 'post', '/api/appointments')
      .send({ slotId })
      .expect(409);
    const replay = await mutate(patient, 'post', '/api/appointments')
      .send({ slotId, idempotencyKey: 'replay-1' })
      .expect(201);
    expect(replay.body.id).toBe(booked.body.id);

    const availability2 = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);
    expect(availability2.body.slots).toHaveLength(1);

    // Le praticien voit le rendez-vous avec le contact du patient.
    const listing = await ctx.doctor.agent
      .get(
        `/api/appointments/schedules/${ctx.scheduleId}/appointments?from=${date}&to=${date}`
      )
      .expect(200);
    const pendingItem = (listing.body.items as { appointment: { id: string } | null }[])
      .find((item) => item.appointment?.id === booked.body.id);
    expect(pendingItem).toBeDefined();

    // Le praticien refuse : motif requis ; le creneau est relibère.
    await mutate(ctx.doctor, 'post', `/api/appointments/${booked.body.id}/decide`)
      .send({ action: 'REJECT' })
      .expect(400);
    await mutate(ctx.doctor, 'post', `/api/appointments/${booked.body.id}/decide`)
      .send({ action: 'REJECT', reason: 'Date non disponible' })
      .expect(200);

    const availability3 = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);
    expect(availability3.body.slots).toHaveLength(2);

    // Un second patient reprend le creneau, le praticien confirme puis cloture.
    const patient2 = await createUserAndSession('appt4_patient2');
    const rebooked = await mutate(patient2, 'post', '/api/appointments')
      .send({ slotId })
      .expect(201);
    await mutate(ctx.doctor, 'post', `/api/appointments/${rebooked.body.id}/decide`)
      .send({ action: 'CONFIRM' })
      .expect(200);

    const confirmed = await patient2.agent
      .get(`/api/appointments/${rebooked.body.id}`)
      .expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.events.map((e: { action: string }) => e.action)).toEqual([
      'CREATED',
      'CONFIRMED'
    ]);

    await mutate(ctx.doctor, 'post', `/api/appointments/${rebooked.body.id}/decide`)
      .send({ action: 'COMPLETE' })
      .expect(200);
  });

  it('5. patient cancellation reopens the slot for someone else', async () => {
    const ctx = await setupAppointmentContext('appt5');
    const date = futureDateString(6);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '09:30' })
      .expect(201);

    const availability = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;

    const patient = await createUserAndSession('appt5_patient');
    const booked = await mutate(patient, 'post', '/api/appointments')
      .send({ slotId })
      .expect(201);

    const cancelled = await mutate(
      patient,
      'post',
      `/api/appointments/${booked.body.id}/cancel`
    )
      .send({ reason: 'Empêchement' })
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    const availability2 = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);
    expect(availability2.body.slots).toHaveLength(1);

    const other = await createUserAndSession('appt5_other');
    const otherBooking = await mutate(other, 'post', '/api/appointments')
      .send({ slotId })
      .expect(201);
    expect(otherBooking.body.status).toBe('PENDING');

    // L'ancien patient ne peut plus annuler le rendez-vous de l'autre patient.
    await mutate(patient, 'post', `/api/appointments/${otherBooking.body.id}/cancel`)
      .expect(403);
  });

  it('6. schedules without confirmation auto-confirm bookings', async () => {
    const ctx = await setupAppointmentContext('appt6');
    const date = futureDateString(7);
    await mutate(
      ctx.doctor,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ requiresConfirmation: false })
      .expect(200);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '09:30' })
      .expect(201);

    const availability = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;

    const patient = await createUserAndSession('appt6_patient');
    const booked = await mutate(patient, 'post', '/api/appointments')
      .send({ slotId })
      .expect(201);
    expect(booked.body.status).toBe('CONFIRMED');

    const mine = await patient.agent.get('/api/appointments/me').expect(200);
    expect((mine.body as { status: string }[])[0].status).toBe('CONFIRMED');
  });

  it('7. past slots and unknown slots cannot be booked', async () => {
    const ctx = await setupAppointmentContext('appt7');
    const patient = await createUserAndSession('appt7_patient');

    await mutate(patient, 'post', '/api/appointments')
      .send({ slotId: '00000000-0000-0000-0000-000000000000' })
      .expect(404);

    const pastSlot = await prisma.appointmentSlot.create({
      data: {
        scheduleId: ctx.scheduleId,
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
        endsAt: new Date(Date.now() - 30 * 60 * 1000),
        status: 'OPEN'
      }
    });
    await mutate(patient, 'post', '/api/appointments')
      .send({ slotId: pastSlot.id })
      .expect(409);
  });

  it('8. availability hides disabled schedules and unknown ids', async () => {
    const ctx = await setupAppointmentContext('appt8');

    await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(200);

    await mutate(
      ctx.doctor,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ status: 'DISABLED' })
      .expect(200);
    await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability`)
      .expect(404);
    await request(server())
      .get('/api/appointments/schedules/00000000-0000-0000-0000-000000000000/availability')
      .expect(404);
  });

  it('9. schedule configuration is audited and immutable', async () => {
    const ctx = await setupAppointmentContext('appt9');

    const created = await prisma.appointmentScheduleEvent.findMany({
      where: { scheduleId: ctx.scheduleId },
      orderBy: { createdAt: 'asc' }
    });
    expect(created.map((event) => event.action)).toEqual(['CREATED']);

    await mutate(
      ctx.doctor,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ visitDurationMinutes: 45 })
      .expect(200);

    const events = await prisma.appointmentScheduleEvent.findMany({
      where: { scheduleId: ctx.scheduleId },
      orderBy: { createdAt: 'asc' }
    });
    expect(events.map((event) => event.action)).toEqual(['CREATED', 'UPDATED']);

    // Le journal est append-only : toute mise a jour est refusee en base.
    await expect(
      prisma.appointmentScheduleEvent.update({
        where: { id: events[0].id },
        data: { action: 'UPDATED' }
      })
    ).rejects.toThrow();
  });

  it('10. disabled confirmation refuses online booking but keeps availability', async () => {
    const ctx = await setupAppointmentContext('appt10');
    const date = futureDateString(8);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '09:30' })
      .expect(201);

    const availability = await request(server())
      .get(
        `/api/appointments/schedules/${ctx.scheduleId}/availability?from=${date}&to=${date}`
      )
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;

    const switched = await mutate(
      ctx.doctor,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ confirmationMode: 'DISABLED' })
      .expect(200);
    expect(switched.body.confirmationMode).toBe('DISABLED');

    const patient = await createUserAndSession('appt10_patient');
    await mutate(patient, 'post', '/api/appointments')
      .send({ slotId })
      .expect(409);
  });

  it('11. AUTOMATIC mode auto-confirms and the boolean alias stays coherent', async () => {
    const ctx = await setupAppointmentContext('appt11');

    const schedule = await mutate(
      ctx.doctor,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ confirmationMode: 'AUTOMATIC' })
      .expect(200);
    expect(schedule.body.confirmationMode).toBe('AUTOMATIC');
    expect(schedule.body.requiresConfirmation).toBe(false);

    await mutate(
      ctx.doctor,
      'put',
      `/api/appointments/schedules/${ctx.affiliationId}`
    )
      .send({ requiresConfirmation: true, confirmationMode: 'AUTOMATIC' })
      .expect(400);

    const date = futureDateString(9);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '09:30' })
      .expect(201);
    const availability = await request(server())
      .get(
        `/api/appointments/schedules/${ctx.scheduleId}/availability?from=${date}&to=${date}`
      )
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;

    const patient = await createUserAndSession('appt11_patient');
    const booked = await mutate(patient, 'post', '/api/appointments')
      .send({ slotId })
      .expect(201);
    expect(booked.body.status).toBe('CONFIRMED');
  });

  it('12. a facility manager can decide on appointments', async () => {
    const ctx = await setupAppointmentContext('appt12');
    const date = futureDateString(10);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '09:30' })
      .expect(201);
    const availability = await request(server())
      .get(
        `/api/appointments/schedules/${ctx.scheduleId}/availability?from=${date}&to=${date}`
      )
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;

    const patient = await createUserAndSession('appt12_patient');
    const booked = await mutate(patient, 'post', '/api/appointments')
      .send({ slotId })
      .expect(201);

    const decided = await mutate(
      ctx.facilityManager,
      'post',
      `/api/appointments/${booked.body.id}/decide`
    )
      .send({ action: 'CONFIRM' })
      .expect(200);
    expect(decided.body.status).toBe('CONFIRMED');

    const stranger = await createUserAndSession('appt12_stranger');
    await mutate(stranger, 'post', `/api/appointments/${booked.body.id}/decide`)
      .send({ action: 'COMPLETE' })
      .expect(403);
  });

  it('13. booking notifies participants; dispatch never claims an unproven send', async () => {
    const ctx = await setupAppointmentContext('appt13');
    const date = futureDateString(11);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '09:30' })
      .expect(201);
    const availability = await request(server())
      .get(
        `/api/appointments/schedules/${ctx.scheduleId}/availability?from=${date}&to=${date}`
      )
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;

    const patient = await createUserAndSession('appt13_patient');
    await mutate(patient, 'post', '/api/appointments')
      .send({ slotId, reason: 'motif confidentiel' })
      .expect(201);

    const mine = await patient.agent.get('/api/notifications/me').expect(200);
    const created = (mine.body as { type: string; status: string; payload: unknown }[]).find(
      (item) => item.type === 'APPOINTMENT_CREATED'
    );
    expect(created).toBeDefined();
    expect(created?.status).toBe('PENDING');
    // Aucune donnee sensible (motif du patient) ne doit fuiter dans le payload.
    expect(JSON.stringify(created?.payload)).not.toContain('motif confidentiel');

    // Un patient ne peut pas declencher ni lire la file globale.
    await mutate(patient, 'post', '/api/admin/notifications/dispatch')
      .send({})
      .expect(403);

    const admin = await createAdmin('appt13_admin');
    const dispatch = await mutate(admin, 'post', '/api/admin/notifications/dispatch')
      .send({})
      .expect(200);
    expect(dispatch.body.skipped).toBeGreaterThanOrEqual(1);

    const after = await patient.agent.get('/api/notifications/me').expect(200);
    const updated = (after.body as { type: string; status: string }[]).find(
      (item) => item.type === 'APPOINTMENT_CREATED'
    );
    expect(updated?.status).toBe('SKIPPED');

    // Rejouer le dispatch ne retraite pas les messages deja traites.
    const replay = await mutate(admin, 'post', '/api/admin/notifications/dispatch')
      .send({})
      .expect(200);
    expect(replay.body.processed).toBe(0);
  });

  it('14. completed and no-show transitions are recorded and notified', async () => {
    const ctx = await setupAppointmentContext('appt14');
    const date = futureDateString(12);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '10:00' })
      .expect(201);
    const availability = await request(server())
      .get(
        `/api/appointments/schedules/${ctx.scheduleId}/availability?from=${date}&to=${date}`
      )
      .expect(200);
    const slots = availability.body.slots as { id: string }[];

    const patientA = await createUserAndSession('appt14_patientA');
    const bookedA = await mutate(patientA, 'post', '/api/appointments')
      .send({ slotId: slots[0].id })
      .expect(201);
    await mutate(ctx.doctor, 'post', `/api/appointments/${bookedA.body.id}/decide`)
      .send({ action: 'CONFIRM' })
      .expect(200);
    const completed = await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/${bookedA.body.id}/decide`
    )
      .send({ action: 'COMPLETE' })
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');

    const patientB = await createUserAndSession('appt14_patientB');
    const bookedB = await mutate(patientB, 'post', '/api/appointments')
      .send({ slotId: slots[1].id })
      .expect(201);
    await mutate(ctx.doctor, 'post', `/api/appointments/${bookedB.body.id}/decide`)
      .send({ action: 'CONFIRM' })
      .expect(200);
    const noShow = await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/${bookedB.body.id}/decide`
    )
      .send({ action: 'NO_SHOW' })
      .expect(200);
    expect(noShow.body.status).toBe('NO_SHOW');

    const detail = await patientA.agent
      .get(`/api/appointments/${bookedA.body.id}`)
      .expect(200);
    expect(
      (detail.body.events as { action: string }[]).map((event) => event.action)
    ).toEqual(['CREATED', 'CONFIRMED', 'COMPLETED']);

    const notifications = await patientA.agent
      .get('/api/notifications/me')
      .expect(200);
    const types = (notifications.body as { type: string }[]).map((item) => item.type);
    expect(types).toContain('APPOINTMENT_COMPLETED');
  });
});