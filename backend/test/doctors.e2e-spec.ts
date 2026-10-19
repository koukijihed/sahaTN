import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const VALID_PASSWORD = 'Passw0rd!2345';

function uniqueEmail(prefix = 'doctor'): string {
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
  const prefix = `${name}=`;
  const entry = cookies.find((cookie) => cookie.startsWith(prefix));
  if (!entry) {
    return undefined;
  }
  return entry.slice(prefix.length).split(';')[0];
}

interface Session {
  userId: string;
  email: string;
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

describe('Doctors & Verification (e2e)', () => {
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

  function mutate(session: Session, method: 'post' | 'put' | 'patch', url: string) {
    return session.agent[method](url).set('x-csrf-token', session.csrf);
  }

  async function promoteToAdmin(userId: string) {
    await prisma.userRole.upsert({
      where: { userId_role: { userId, role: Role.ADMIN } },
      update: {},
      create: { userId, role: Role.ADMIN }
    });
  }

  async function seedSpecialty(name = 'Cardiologie') {
    const stamp = Date.now();
    return prisma.specialty.create({
      data: {
        code: `CAR-${stamp}`,
        labelFr: `${name} ${stamp}`
      }
    });
  }

  async function createFullProfile(prefix: string, specialtyId: string) {
    const doctor = await createUserAndSession(prefix);
    await mutate(doctor, 'put', '/api/doctors/me')
      .send({
        displayName: 'Dr Amina Test',
        professionalDescription: 'Medecin generaliste.',
        languages: ['fr', 'ar'],
        yearsOfExperience: 8,
        specialtyIds: [specialtyId]
      })
      .expect(200);
    return doctor;
  }

  async function createAdmin(prefix = 'admin') {
    const admin = await createUserAndSession(prefix);
    await promoteToAdmin(admin.userId);
    return admin;
  }

  async function declareCredential(doctor: Session) {
    await mutate(doctor, 'post', '/api/doctors/me/credentials')
      .send({
        type: 'DIPLOMA',
        issuingBody: 'Faculte de medecine de Tunis'
      })
      .expect(201);
  }

  async function latestRequestId(userId: string): Promise<string> {
    const requestRow = await prisma.doctorVerificationRequest.findFirst({
      where: { doctorProfile: { userId } },
      orderBy: { createdAt: 'desc' }
    });
    expect(requestRow).not.toBeNull();
    return (requestRow as { id: string }).id;
  }

  it('1. refuses unauthenticated access to private doctor endpoints', async () => {
    await request(server()).get('/api/doctors/me').expect(401);
    await request(server()).put('/api/doctors/me').send({}).expect(403);
    await request(server()).get('/api/admin/doctor-verifications').expect(401);
  });

  it('2. a patient cannot self-assign DOCTOR or forge a verified profile', async () => {
    await request(server())
      .post('/api/auth/register')
      .send({
        email: uniqueEmail('impostor'),
        password: VALID_PASSWORD,
        role: 'DOCTOR'
      })
      .expect(400);

    const bystander = await createUserAndSession('bystander');
    await mutate(bystander, 'put', '/api/doctors/me')
      .send({
        displayName: 'Faux medecin',
        verificationStatus: 'VERIFIED',
        userId: '00000000-0000-4000-8000-000000000000'
      })
      .expect(400);
  });

  it('3. a doctor can create and then update its own profile only', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('self', specialty.id);

    const profile = await doctor.agent.get('/api/doctors/me').expect(200);
    expect(profile.body.profile.displayName).toBe('Dr Amina Test');
    expect(profile.body.profile.verificationStatus).toBe('UNVERIFIED');
    expect(profile.body.profile.isPubliclyListed).toBe(false);

    const updated = await mutate(doctor, 'put', '/api/doctors/me')
      .send({ professionalDescription: 'Description mise a jour.' })
      .expect(200);
    expect(updated.body.profile.professionalDescription).toBe(
      'Description mise a jour.'
    );
    expect(updated.body.profile.displayName).toBe('Dr Amina Test');

    const profiles = await prisma.doctorProfile.count({
      where: { userId: doctor.userId }
    });
    expect(profiles).toBe(1);
  });

  it('4. a user without a profile gets 404 on own profile', async () => {
    const user = await createUserAndSession('noprofile');
    await user.agent.get('/api/doctors/me').expect(404);
    await user.agent.get('/api/doctors/me/credentials').expect(404);
  });

  it('5. credentials are declared as metadata only', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('creds', specialty.id);

    await mutate(doctor, 'post', '/api/doctors/me/credentials')
      .send({
        type: 'DIPLOMA',
        issuingBody: 'Faculte de medecine de Tunis',
        reference: 'DIP-2020-42',
        obtainedAt: '2020-06-30'
      })
      .expect(201);

    const response = await doctor.agent
      .get('/api/doctors/me/credentials')
      .expect(200);
    expect(response.body.credentials).toHaveLength(1);
    expect(response.body.credentials[0]).toMatchObject({
      type: 'DIPLOMA',
      issuingBody: 'Faculte de medecine de Tunis'
    });
    expect(response.body.credentials[0]).not.toHaveProperty('file');
  });

  it('6. submissions: draft then submit -> PENDING while staying active', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('submit', specialty.id);
    await declareCredential(doctor);

    const draft = await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: false })
      .expect(201);
    expect(draft.body.request.status).toBe('DRAFT');

    const mine = await doctor.agent
      .get('/api/doctors/me/verification')
      .expect(200);
    expect(mine.body.request.status).toBe('DRAFT');
    const requestId = mine.body.request.id;

    const submitted = await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);
    expect(submitted.body.request.id).toBe(requestId);
    expect(submitted.body.request.status).toBe('PENDING');
  });

  it('7. a medical professional cannot approve its own verification', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('selfapprove', specialty.id);
    await declareCredential(doctor);
    await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);
    await promoteToAdmin(doctor.userId);

    const requestId = await latestRequestId(doctor.userId);
    await mutate(
      doctor,
      'post',
      `/api/admin/doctor-verifications/${requestId}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(403);
  });

  it('8. non-admins cannot examine admin data and leaks nothing confidential', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('adminflow', specialty.id);
    await declareCredential(doctor);
    await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);

    const patient = await createUserAndSession('patient');
    const forbidden = await patient.agent
      .get('/api/admin/doctor-verifications')
      .expect(403);
    expect(JSON.stringify(forbidden.body)).not.toContain('Medecin g');
    expect(JSON.stringify(forbidden.body)).not.toContain('verificationStatus');

    const admin = await createAdmin('adminflow');
    const list = await admin.agent
      .get('/api/admin/doctor-verifications')
      .expect(200);
    expect(Array.isArray(list.body.items)).toBe(true);
    expect(list.body.items.length).toBeGreaterThan(0);

    const requestId = list.body.items[0].id;
    const detail = await admin.agent
      .get(`/api/admin/doctor-verifications/${requestId}`)
      .expect(200);
    expect(detail.body.id).toBe(requestId);
    expect(detail.body.status).toBe('PENDING');
  });

  it('9. invalid transitions are rejected with 409', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('transition', specialty.id);
    await declareCredential(doctor);
    await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);

    const admin = await createAdmin('transition');
    const requestId = await latestRequestId(doctor.userId);

    await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${requestId}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(409);

    const after = await prisma.doctorVerificationRequest.findUnique({
      where: { id: requestId }
    });
    expect(after?.status).toBe('PENDING');
  });

  it('10. an unverified doctor cannot become listed in the public directory', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('hidden', specialty.id);
    await mutate(doctor, 'put', '/api/doctors/me/visibility')
      .send({ listed: true })
      .expect(403);
  });

  it('11. full happy path with audit trail and public directory', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createFullProfile('happy', specialty.id);
    await mutate(doctor, 'post', '/api/doctors/me/credentials')
      .send({
        type: 'DIPLOMA',
        issuingBody: 'Faculte de medecine de Sousse'
      })
      .expect(201);
    await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);

    const profileId = (await doctor.agent.get('/api/doctors/me').expect(200))
      .body.profile.id as string;

    const admin = await createAdmin('happy');
    const requestId = await latestRequestId(doctor.userId);

    await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${requestId}/decision`
    )
      .send({ action: 'START_REVIEW' })
      .expect(200);

    const rejected = await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${requestId}/decision`
    )
      .send({ action: 'REJECT', reason: 'Justificatif illisible.' })
      .expect(200);
    expect(rejected.body.status).toBe('REJECTED');

    const mineAfterReject = await doctor.agent
      .get('/api/doctors/me/verification')
      .expect(200);
    expect(mineAfterReject.body.request.status).toBe('REJECTED');

    await mutate(doctor, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);

    const newRequestId = await latestRequestId(doctor.userId);
    expect(newRequestId).not.toBe(requestId);

    await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${newRequestId}/decision`
    )
      .send({ action: 'START_REVIEW' })
      .expect(200);
    const approved = await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${newRequestId}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);
    expect(approved.body.status).toBe('APPROVED');

    await mutate(doctor, 'put', '/api/doctors/me/visibility')
      .send({ listed: true })
      .expect(200);

    const mine = await doctor.agent.get('/api/doctors/me').expect(200);
    expect(mine.body.profile.verificationStatus).toBe('VERIFIED');
    expect(mine.body.profile.isPubliclyListed).toBe(true);

    const publicProfile = await request(server())
      .get(`/api/doctors/${profileId}`)
      .expect(200);
    expect(publicProfile.body.profile.displayName).toBe('Dr Amina Test');
    expect(publicProfile.body.profile.specialties).toHaveLength(1);
    expect(publicProfile.body.profile).not.toHaveProperty('email');
    expect(publicProfile.body.profile).not.toHaveProperty(
      'verificationStatus'
    );
    expect(publicProfile.body.profile).not.toHaveProperty('credentials');

    const detail = await admin.agent
      .get(`/api/admin/doctor-verifications/${newRequestId}`)
      .expect(200);
    const actions = detail.body.events.map(
      (event: { action: string }) => event.action
    );
    expect(actions).toContain('REVIEW_STARTED');
    expect(actions).toContain('APPROVED');
  });

  it('12. hidden or non-verified doctors are indistinguishable in the public directory', async () => {
    const specialty = await seedSpecialty();
    const unverified = await createFullProfile('invisible', specialty.id);
    const unverifiedProfileId = (
      await unverified.agent.get('/api/doctors/me').expect(200)
    ).body.profile.id as string;
    await request(server())
      .get(`/api/doctors/${unverifiedProfileId}`)
      .expect(404);

    const hidden = await createFullProfile('revoked', specialty.id);
    const hiddenProfileId = (
      await hidden.agent.get('/api/doctors/me').expect(200)
    ).body.profile.id as string;
    await declareCredential(hidden);
    await mutate(hidden, 'post', '/api/doctors/me/verification')
      .send({ submit: true })
      .expect(201);

    const admin = await createAdmin('revoked');
    const requestId = await latestRequestId(hidden.userId);
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
    await mutate(hidden, 'put', '/api/doctors/me/visibility')
      .send({ listed: false })
      .expect(200);

    await request(server()).get(`/api/doctors/${hiddenProfileId}`).expect(404);
  });
});