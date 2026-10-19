import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MedicalRecordAccessAction,
  RecordGrantPermission,
  Role
} from '@prisma/client';
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

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

interface Session {
  userId: string;
  email: string;
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

const VALID_FACILITY = {
  displayName: 'Clinique Dossier',
  officialName: 'Clinique Dossier Tunis',
  description: 'Etablissement prive de test.',
  sector: 'PRIVATE',
  type: 'PRIVATE_CLINIC',
  licenseReference: 'LIC-DME-0001',
  sourceReference: 'ANN-DME-0001',
  addressLine: '9 Rue du Dossier',
  city: 'Tunis',
  governorate: 'TUNIS',
  delegation: 'Tunis Ville',
  postalCode: '1002',
  phone: '+216 70 222 222',
  websiteUrl: 'https://dossier.example.tn'
};

const DENIED_MESSAGE = 'Access to this medical record is not authorized';

const FULL_READ: RecordGrantPermission[] = [
  RecordGrantPermission.VIEW_RECORD,
  RecordGrantPermission.VIEW_ENCOUNTERS,
  RecordGrantPermission.VIEW_OBSERVATIONS,
  RecordGrantPermission.VIEW_DIAGNOSES,
  RecordGrantPermission.VIEW_ALLERGIES
];

const FULL_WRITE: RecordGrantPermission[] = [
  RecordGrantPermission.WRITE_ENCOUNTERS,
  RecordGrantPermission.WRITE_OBSERVATIONS,
  RecordGrantPermission.WRITE_DIAGNOSES,
  RecordGrantPermission.WRITE_ALLERGIES
];

describe('Medical records access & consent (e2e)', () => {
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
      data: { code: `DME-${stamp}`, labelFr: `${name} ${stamp}` }
    });
  }

  async function doctorProfileIdOf(userId: string): Promise<string> {
    const profile = await prisma.doctorProfile.findUnique({ where: { userId } });
    expect(profile).not.toBeNull();
    return (profile as { id: string }).id;
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

  async function createUnverifiedDoctor(
    prefix: string,
    specialtyId: string
  ): Promise<Session> {
    const doctor = await createUserAndSession(prefix);
    await mutate(doctor, 'put', '/api/doctors/me')
      .send({
        displayName: `Dr zz ${prefix}`,
        professionalDescription: 'Praticien non verifie.',
        languages: ['fr'],
        yearsOfExperience: 2,
        specialtyIds: [specialtyId]
      })
      .expect(200);
    return doctor;
  }

  async function createVerifiedFacility(prefix: string) {
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

  async function setupAppointmentContext(prefix: string) {
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

  async function grantRead(
    patient: Session,
    doctorProfileId: string,
    permissions: RecordGrantPermission[] = FULL_READ
  ) {
    return mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({ doctorProfileId, permissions, reason: 'Suivi en cours' })
      .expect(201);
  }

  it('1. a past confirmed visit alone never grants access to the record', async () => {
    const ctx = await setupAppointmentContext('dme1');
    const patient = await createUserAndSession('dme1_patient');

    const date = futureDateString(3);
    await mutate(
      ctx.doctor,
      'post',
      `/api/appointments/schedules/${ctx.scheduleId}/slots/generate`
    )
      .send({ date, startTime: '09:00', endTime: '09:30' })
      .expect(201);
    const availability = await request(server())
      .get(`/api/appointments/schedules/${ctx.scheduleId}/availability?from=${date}&to=${date}`)
      .expect(200);
    const slotId = (availability.body.slots as { id: string }[])[0].id;
    const booked = await mutate(patient, 'post', '/api/appointments')
      .send({ slotId })
      .expect(201);
    await mutate(ctx.doctor, 'post', `/api/appointments/${booked.body.id}/decide`)
      .send({ action: 'CONFIRM' })
      .expect(200);

    // Le patient possede un dossier (il le cree en le consultant).
    await patient.agent.get('/api/medical-records/me').expect(200);

    const denied = await ctx.doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(403);
    expect(denied.body.message).toBe(DENIED_MESSAGE);

    const status = await ctx.doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/access`)
      .expect(200);
    expect(status.body.verified).toBe(true);
    expect(status.body.recordExists).toBe(true);
    expect(status.body.readAllowed).toBe(false);
  });

  it('2. the patient owns the record; reading it materialises it', async () => {
    const patient = await createUserAndSession('dme2_patient');
    const summary = await patient.agent
      .get('/api/medical-records/me')
      .expect(200);
    expect(summary.body.patientUserId).toBe(patient.userId);
    expect(summary.body.counts).toEqual({
      encounters: 0,
      observations: 0,
      diagnoses: 0,
      allergies: 0
    });
    const encounters = await patient.agent
      .get('/api/medical-records/me/encounters')
      .expect(200);
    expect(encounters.body).toEqual([]);
  });

  it('3. a read grant lets the doctor read but never write', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme3_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme3_patient');
    await grantRead(patient, doctorProfileId);

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(200);
    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/encounters`)
      .expect(200);
    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/allergies`)
      .expect(200);

    const writeDenied = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters`
    )
      .send({ occurredAt: new Date().toISOString() })
      .expect(403);
    expect(writeDenied.body.message).toBe(DENIED_MESSAGE);

    // Le patient voit la lecture dans son journal d'acces.
    const journal = await patient.agent
      .get('/api/medical-records/me/access')
      .expect(200);
    const viewed = (journal.body as { action: string; actor: string }[]).find(
      (event) => event.action === 'RECORD_VIEWED' && event.actor === 'DOCTOR'
    );
    expect(viewed).toBeDefined();
  });

  it('4. write permissions let the doctor author clinical entries', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme4_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme4_patient');
    await grantRead(patient, doctorProfileId, [...FULL_READ, ...FULL_WRITE]);

    const encounter = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters`
    )
      .send({
        occurredAt: new Date().toISOString(),
        chiefComplaint: 'Douleur abdominale',
        notes: 'Examen sans signe de gravite'
      })
      .expect(201);
    const encounterId = encounter.body.id as string;

    await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters/${encounterId}/observations`
    )
      .send({
        category: 'VITAL_SIGN',
        label: 'Tension arterielle systolique',
        valueNumeric: 120,
        unit: 'mmHg',
        observedAt: new Date().toISOString()
      })
      .expect(201);

    await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/diagnoses`
    )
      .send({
        encounterId,
        label: 'Appendicite aigue',
        code: 'K35.8',
        diagnosedAt: new Date().toISOString()
      })
      .expect(201);

    await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/allergies`
    )
      .send({
        allergen: 'Penicilline',
        reaction: 'Urticaire',
        recordedAt: new Date().toISOString()
      })
      .expect(201);

    // Le patient lit sa consultation avec observation et diagnostic.
    const detail = await patient.agent
      .get(`/api/medical-records/me/encounters/${encounterId}`)
      .expect(200);
    expect(detail.body.observations).toHaveLength(1);
    expect(detail.body.diagnoses).toHaveLength(1);

    const audit = await prisma.medicalRecordAccessEvent.findMany({
      where: { medicalRecord: { patientUserId: patient.userId } },
      orderBy: { createdAt: 'asc' }
    });
    const actions = audit.map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'ENCOUNTER_CREATED',
        'OBSERVATION_CREATED',
        'DIAGNOSIS_CREATED',
        'ALLERGY_CREATED'
      ])
    );
    expect(
      audit.find((event) => event.action === 'ENCOUNTER_CREATED')?.purpose
    ).toBe('EXPLICIT_GRANT');
  });

  it('5. revocation is immediate and audited', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme5_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme5_patient');
    const created = await grantRead(patient, doctorProfileId);

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(200);

    await mutate(
      patient,
      'post',
      `/api/medical-records/me/grants/${created.body.id}/revoke`
    )
      .send({ reason: 'Retrait du consentement' })
      .expect(200);

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(403);

    const revoke = await prisma.medicalRecordAccessEvent.findFirst({
      where: {
        medicalRecord: { patientUserId: patient.userId },
        action: 'GRANT_REVOKED'
      }
    });
    expect(revoke).not.toBeNull();
  });

  it('6. an expired grant is refused', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme6_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme6_patient');
    await patient.agent.get('/api/medical-records/me').expect(200);
    const record = await prisma.medicalRecord.findUniqueOrThrow({
      where: { patientUserId: patient.userId }
    });
    await prisma.medicalRecordGrant.create({
      data: {
        medicalRecordId: record.id,
        granteeDoctorProfileId: doctorProfileId,
        permissions: FULL_READ,
        effectiveAt: new Date('2020-01-01T00:00:00Z'),
        expiresAt: new Date('2020-02-01T00:00:00Z'),
        grantedByUserId: patient.userId
      }
    });

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(403);

    const denial = await prisma.medicalRecordAccessEvent.findFirst({
      where: {
        medicalRecordId: record.id,
        action: 'ACCESS_DENIED'
      },
      orderBy: { createdAt: 'desc' }
    });
    expect(denial?.reason).toBe('authorization_expired');
  });

  it('7. a not-yet-effective grant is refused', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme7_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme7_patient');
    await patient.agent.get('/api/medical-records/me').expect(200);
    const record = await prisma.medicalRecord.findUniqueOrThrow({
      where: { patientUserId: patient.userId }
    });
    await prisma.medicalRecordGrant.create({
      data: {
        medicalRecordId: record.id,
        granteeDoctorProfileId: doctorProfileId,
        permissions: FULL_READ,
        effectiveAt: hoursFromNow(24),
        grantedByUserId: patient.userId
      }
    });

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(403);

    const denial = await prisma.medicalRecordAccessEvent.findFirst({
      where: { medicalRecordId: record.id, action: 'ACCESS_DENIED' },
      orderBy: { createdAt: 'desc' }
    });
    expect(denial?.reason).toBe('authorization_not_effective');
  });

  it('8. permissions are granular (allergies without encounters)', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme8_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme8_patient');
    await grantRead(patient, doctorProfileId, [RecordGrantPermission.VIEW_ALLERGIES]);

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/allergies`)
      .expect(200);
    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/encounters`)
      .expect(403);
  });

  it('9. emergency access is read-only, bounded and notifies the patient', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme9_doctor', specialty.id);
    const patient = await createUserAndSession('dme9_patient');
    await patient.agent.get('/api/medical-records/me').expect(200);

    const before = Date.now();
    const granted = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/emergency-access`
    )
      .send({
        justification:
          'Patient inconscient admis aux urgences : besoin des allergies et traitements.'
      })
      .expect(201);
    expect(granted.body.status).toBe('ACTIVE');
    const expiresAt = new Date(granted.body.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThan(before);
    expect(expiresAt).toBeLessThan(before + 25 * 60 * 60 * 1000);

    // Lecture autorisee, ecriture refusee (lecture seule).
    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(200);
    await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/allergies`
    )
      .send({ allergen: 'Arachide', recordedAt: new Date().toISOString() })
      .expect(403);

    const emergencies = await patient.agent
      .get('/api/medical-records/me/emergency-access')
      .expect(200);
    expect(emergencies.body).toHaveLength(1);
    expect(emergencies.body[0].justification).toContain('urgences');

    const notifications = await patient.agent
      .get('/api/notifications/me')
      .expect(200);
    const alert = (notifications.body as { type: string }[]).find(
      (item) => item.type === 'EMERGENCY_ACCESS_GRANTED'
    );
    expect(alert).toBeDefined();
  });

  it('10. denied attempts are audited and the message leaks nothing', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme10_doctor', specialty.id);
    const patient = await createUserAndSession('dme10_patient');
    await patient.agent.get('/api/medical-records/me').expect(200);

    const denied = await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(403);
    expect(denied.body.message).toBe(DENIED_MESSAGE);

    const journal = await patient.agent
      .get('/api/medical-records/me/access')
      .expect(200);
    const entry = (
      journal.body as { action: string; reason: string | null; actor: string }[]
    ).find((event) => event.action === 'ACCESS_DENIED');
    expect(entry).toBeDefined();
    expect(entry?.reason).toBe('no_authorization');
    expect(entry?.actor).toBe('DOCTOR');
  });

  it('11. grants can only target verified professionals', async () => {
    const specialty = await seedSpecialty();
    const unverified = await createUnverifiedDoctor('dme11_doctor', specialty.id);
    const unverifiedProfileId = await doctorProfileIdOf(unverified.userId);
    const patient = await createUserAndSession('dme11_patient');

    await mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({
        doctorProfileId: unverifiedProfileId,
        permissions: FULL_READ
      })
      .expect(400);
  });

  it('12. ending a care relationship does not silently revoke a valid grant', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme12_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme12_patient');
    await grantRead(patient, doctorProfileId);

    const relations = await patient.agent
      .get('/api/medical-records/me/relations')
      .expect(200);
    expect(relations.body).toHaveLength(1);
    expect(relations.body[0].source).toBe('PATIENT_GRANT');
    const relationId = relations.body[0].id as string;

    await mutate(
      patient,
      'post',
      `/api/medical-records/me/relations/${relationId}/end`
    ).expect(200);

    // La relation est une projection : le consentement explicite reste effectif.
    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}`)
      .expect(200);
  });

  it('13. clinical entries and the access log are append-only', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('dme13_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('dme13_patient');
    await grantRead(patient, doctorProfileId, [...FULL_READ, ...FULL_WRITE]);

    const encounter = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters`
    )
      .send({ occurredAt: new Date().toISOString() })
      .expect(201);

    // Suppression silencieuse interdite par le declencheur base.
    await expect(
      prisma.clinicalEncounter.delete({ where: { id: encounter.body.id as string } })
    ).rejects.toThrow();

    const event = await prisma.medicalRecordAccessEvent.findFirstOrThrow({
      where: { action: 'ENCOUNTER_CREATED', targetId: encounter.body.id as string }
    });
    await expect(
      prisma.medicalRecordAccessEvent.update({
        where: { id: event.id },
        data: { reason: 'falsified' }
      })
    ).rejects.toThrow();
  });

  it('14. concurrent reads materialise exactly one consistent patient record', async () => {
    const patient = await createUserAndSession('dme14_patient');

    // Plusieurs lectures simultanees d'un patient encore sans dossier : toutes
    // declenchent `ensurePatientRecord`, qui peut se heurter a la contrainte
    // unique `MedicalRecord_patientUserId_key` (P2002). Le service doit
    // rattraper la course et renvoyer un dossier unique et coherent.
    const paths = [
      '/api/medical-records/me',
      '/api/medical-records/me/encounters',
      '/api/medical-records/me/diagnoses',
      '/api/medical-records/me/allergies',
      '/api/medical-records/me',
      '/api/medical-records/me/encounters',
      '/api/medical-records/me/diagnoses',
      '/api/medical-records/me/allergies'
    ];

    const responses = await Promise.all(
      paths.map((path) => patient.agent.get(path))
    );
    responses.forEach((response) => expect(response.status).toBe(200));

    const summary = await patient.agent
      .get('/api/medical-records/me')
      .expect(200);
    expect(summary.body.patientUserId).toBe(patient.userId);

    // Un seul dossier physique, et une seule trace RECORD_CREATED : les appels
    // concurrents perdants ont relu le dossier sans en creer un second.
    const records = await prisma.medicalRecord.findMany({
      where: { patientUserId: patient.userId }
    });
    expect(records).toHaveLength(1);

    const created = await prisma.medicalRecordAccessEvent.count({
      where: {
        medicalRecordId: records[0].id,
        action: MedicalRecordAccessAction.RECORD_CREATED
      }
    });
    expect(created).toBe(1);

    // Aucune fuite croisee : le dossier materialise appartient bien au patient.
    expect(records[0].patientUserId).toBe(patient.userId);
  });
});
