import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const VALID_PASSWORD = 'Passw0rd!2345';

function uniqueEmail(prefix = 'facility'): string {
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

const VALID_FACILITY = {
  displayName: 'Clinique Horizon',
  officialName: 'Clinique Horizon Tunis',
  description: 'Etablissement prive de jour.',
  sector: 'PRIVATE',
  type: 'PRIVATE_CLINIC',
  licenseReference: 'LIC-DEMO-0001',
  sourceReference: 'ANN-DEMO-0001',
  addressLine: '12 Rue de la Liberte',
  city: 'Tunis',
  governorate: 'TUNIS',
  delegation: 'Tunis Ville',
  postalCode: '1001',
  phone: '+216 70 000 000',
  websiteUrl: 'https://example.tn'
};

interface FacilityRef {
  creator: Session;
  facility: { id: string; verificationStatus: string; isPubliclyListed: boolean };
}

describe('Facilities & Affiliations (e2e)', () => {
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

  async function createAdmin(prefix = 'admin') {
    const admin = await createUserAndSession(prefix);
    await promoteToAdmin(admin.userId);
    return admin;
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

  async function createVerifiedDoctor(
    prefix: string,
    specialtyId: string
  ): Promise<Session> {
    const doctor = await createUserAndSession(prefix);
    await mutate(doctor, 'put', '/api/doctors/me')
      .send({
        displayName: `Dr ${prefix}`,
        professionalDescription: 'Praticien teste.',
        languages: ['fr', 'ar'],
        yearsOfExperience: 6,
        specialtyIds: [specialtyId]
      })
      .expect(200);
    await mutate(doctor, 'post', '/api/doctors/me/credentials')
      .send({
        type: 'DIPLOMA',
        issuingBody: 'Faculte de medecine de Tunis'
      })
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
    return doctor;
  }

  async function createFacility(prefix: string): Promise<FacilityRef> {
    const creator = await createUserAndSession(prefix);
    const response = await mutate(creator, 'post', '/api/facilities')
      .send(VALID_FACILITY)
      .expect(201);
    return { creator, facility: response.body };
  }

  async function verifyFacility(
    prefix: string
  ): Promise<FacilityRef & { admin: Session }> {
    const { creator, facility } = await createFacility(prefix);
    const admin = await createAdmin(`${prefix}_admin`);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/managers`)
      .send({ userId: creator.userId })
      .expect(201);
    await mutate(creator, 'post', `/api/facilities/${facility.id}/verification`)
      .send({ submit: true })
      .expect(201);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/decision`)
      .send({ action: 'START_REVIEW' })
      .expect(200);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/decision`)
      .send({ action: 'APPROVE' })
      .expect(200);
    await mutate(creator, 'put', `/api/facilities/${facility.id}/manage`)
      .send({ isPubliclyListed: true })
      .expect(200);
    return { creator, admin, facility };
  }

  async function verifyDoctorFacilityAffiliation(prefix: string): Promise<{
    doctor: Session;
    affiliationId: string;
    specialty: { id: string };
    ref: FacilityRef & { admin: Session };
  }> {
    const specialty = await seedSpecialty();
    const ref = await verifyFacility(prefix);
    const doctor = await createVerifiedDoctor(`${prefix}_doctor`, specialty.id);
    const requestAff = await mutate(
      doctor,
      'post',
      `/api/facilities/${ref.facility.id}/affiliations`
    ).expect(201);
    const affiliationId = requestAff.body.id as string;
    await mutate(
      ref.admin,
      'post',
      `/api/admin/facility-affiliations/${affiliationId}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);
    return { doctor, affiliationId, specialty, ref };
  }

  it('1. creates a facility in DRAFT, unlisted and hidden from the public', async () => {
    const { facility } = await createFacility('f1');
    expect(facility.verificationStatus).toBe('DRAFT');
    expect(facility.isPubliclyListed).toBe(false);
    await request(server()).get(`/api/facilities/${facility.id}`).expect(404);
    const list = await request(server()).get('/api/facilities').expect(200);
    expect(list.body.items.some((i: { id: string }) => i.id === facility.id)).toBe(false);
  });

  it('2. directory lists only verified and listed facilities', async () => {
    const { facility } = await verifyFacility('f2');
    const list = await request(server()).get('/api/facilities').expect(200);
    expect(list.body.items.some((i: { id: string }) => i.id === facility.id)).toBe(true);
    const detail = await request(server())
      .get(`/api/facilities/${facility.id}`)
      .expect(200);
    expect(detail.body.displayName).toBe('Clinique Horizon');
  });

  it('3. directory filters, search and pagination bounds work', async () => {
    const { facility } = await verifyFacility('f3');
    const byGovernorate = await request(server())
      .get('/api/facilities?governorate=TUNIS')
      .expect(200);
    expect(byGovernorate.body.items.map((i: { id: string }) => i.id)).toContain(facility.id);
    const byType = await request(server())
      .get('/api/facilities?sector=PRIVATE&type=PRIVATE_CLINIC')
      .expect(200);
    expect(byType.body.items.map((i: { id: string }) => i.id)).toContain(facility.id);
    const byQuery = await request(server())
      .get('/api/facilities?q=Horizon')
      .expect(200);
    expect(byQuery.body.items.map((i: { id: string }) => i.id)).toContain(facility.id);
    await request(server()).get('/api/facilities?limit=0').expect(400);
    await request(server()).get('/api/facilities?limit=51').expect(400);
    const paged = await request(server())
      .get('/api/facilities?page=1&limit=1')
      .expect(200);
    expect(paged.body.items.length).toBeLessThanOrEqual(1);
    expect(paged.body.page).toBe(1);
    expect(paged.body.limit).toBe(1);
  });

  it('4. public detail never leaks internal data', async () => {
    const { facility } = await verifyFacility('f4');
    const detail = await request(server())
      .get(`/api/facilities/${facility.id}`)
      .expect(200);
    expect(detail.body).not.toHaveProperty('licenseReference');
    expect(detail.body).not.toHaveProperty('sourceReference');
    expect(detail.body).not.toHaveProperty('managers');
    expect(detail.body).not.toHaveProperty('verificationStatus');
    expect(detail.body).not.toHaveProperty('latestVerificationRequest');
    expect(detail.body.verifiedAffiliations).toHaveLength(0);
  });

  it('5. verification workflow: submit, corrections, approvals and invalid transitions', async () => {
    const { creator, facility } = await createFacility('f5');
    const admin = await createAdmin('f5_admin');
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/managers`)
      .send({ userId: creator.userId })
      .expect(201);

    const submitted = await mutate(
      creator,
      'post',
      `/api/facilities/${facility.id}/verification`
    )
      .send({ submit: true })
      .expect(201);
    expect(submitted.body.status).toBe('PENDING');

    await mutate(
      admin,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(409);

    await mutate(
      admin,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'START_REVIEW' })
      .expect(200);

    await mutate(
      admin,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'REQUEST_CORRECTION' })
      .expect(400);
    await mutate(
      admin,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'REQUEST_CORRECTION', reason: 'Adresse incomplete.' })
      .expect(200);

    const manage = await creator.agent
      .get(`/api/facilities/${facility.id}/manage`)
      .expect(200);
    expect(manage.body.verificationStatus).toBe('NEEDS_CORRECTION');

    await mutate(creator, 'post', `/api/facilities/${facility.id}/verification`)
      .send({ submit: true })
      .expect(201);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/decision`)
      .send({ action: 'START_REVIEW' })
      .expect(200);
    const approved = await mutate(
      admin,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);
    expect(approved.body.status).toBe('VERIFIED');
  });

  it('6. an administrator who manages a facility cannot decide on it', async () => {
    const { creator, facility } = await createFacility('f6');
    const admin = await createAdmin('f6_admin');
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/managers`)
      .send({ userId: creator.userId })
      .expect(201);
    await promoteToAdmin(creator.userId);
    await mutate(creator, 'post', `/api/facilities/${facility.id}/verification`)
      .send({ submit: true })
      .expect(201);
    await mutate(
      creator,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'START_REVIEW' })
      .expect(403);
  });

  it('7. verified facilities keep immutable identity but keep open fields editable', async () => {
    const { creator, facility } = await verifyFacility('f7');
    await mutate(creator, 'put', `/api/facilities/${facility.id}/manage`)
      .send({ displayName: 'Autre nom' })
      .expect(409);
    const updated = await mutate(
      creator,
      'put',
      `/api/facilities/${facility.id}/manage`
    )
      .send({ phone: '+216 71 111 111' })
      .expect(200);
    expect(updated.body.phone).toBe('+216 71 111 111');
    expect(updated.body.displayName).toBe('Clinique Horizon');
  });

  it('8. only verified facilities can become publicly listed', async () => {
    const { creator, facility } = await createFacility('f8');
    await mutate(creator, 'put', `/api/facilities/${facility.id}/manage`)
      .send({ isPubliclyListed: true })
      .expect(403);

    const admin = await createAdmin('f8_admin');
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/managers`)
      .send({ userId: creator.userId })
      .expect(201);
    await mutate(creator, 'post', `/api/facilities/${facility.id}/verification`)
      .send({ submit: true })
      .expect(201);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/decision`)
      .send({ action: 'START_REVIEW' })
      .expect(200);
    const approved = await mutate(
      admin,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);
    expect(approved.body.status).toBe('VERIFIED');

    const listed = await mutate(
      creator,
      'put',
      `/api/facilities/${facility.id}/manage`
    )
      .send({ isPubliclyListed: true })
      .expect(200);
    expect(listed.body.isPubliclyListed).toBe(true);
  });

  it('9. management and admin endpoints reject outsiders', async () => {
    const { facility } = await createFacility('f9');
    const bystander = await createUserAndSession('f9_by');
    await bystander.agent.get(`/api/facilities/${facility.id}/manage`).expect(403);
    await mutate(bystander, 'post', `/api/facilities/${facility.id}/verification`)
      .send({ submit: true })
      .expect(403);
    await bystander.agent.get('/api/admin/facilities').expect(403);
    await mutate(
      bystander,
      'post',
      `/api/admin/facilities/${facility.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(403);
  });

  it('10. only verified doctors can request an affiliation', async () => {
    const specialty = await seedSpecialty();
    const unverified = await createUserAndSession('f10_doc');
    await mutate(unverified, 'put', '/api/doctors/me')
      .send({
        displayName: 'Dr Non Verifie',
        specialtyIds: [specialty.id]
      })
      .expect(200);
    const { facility } = await verifyFacility('f10');
    await mutate(unverified, 'post', `/api/facilities/${facility.id}/affiliations`)
      .expect(403);
  });

  it('11. affiliation decisions follow the verified-doctor-and-facility rules', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('f11_doctor', specialty.id);
    const { facility } = await createFacility('f11_facility');

    const requested = await mutate(
      doctor,
      'post',
      `/api/facilities/${facility.id}/affiliations`
    ).expect(201);
    expect(requested.body.status).toBe('REQUESTED');

    const admin = await createAdmin('f11_admin');
    await mutate(
      admin,
      'post',
      `/api/admin/facility-affiliations/${requested.body.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(409);

    await mutate(
      admin,
      'post',
      `/api/admin/facility-affiliations/${requested.body.id}/decision`
    )
      .send({ action: 'REJECT' })
      .expect(400);
    const rejected = await mutate(
      admin,
      'post',
      `/api/admin/facility-affiliations/${requested.body.id}/decision`
    )
      .send({ action: 'REJECT', reason: 'Pas de convention.' })
      .expect(200);
    expect(rejected.body.status).toBe('REJECTED');
    await mutate(
      admin,
      'post',
      `/api/admin/facility-affiliations/${requested.body.id}/decision`
    )
      .send({ action: 'REJECT', reason: 'Deja traite.' })
      .expect(409);
  });

  it('12. verified affiliations are public and the directory filters by specialty', async () => {
    const { specialty, ref } = await verifyDoctorFacilityAffiliation('f12');
    const detail = await request(server())
      .get(`/api/facilities/${ref.facility.id}`)
      .expect(200);
    expect(detail.body.verifiedAffiliations).toHaveLength(1);
    const filtered = await request(server())
      .get(`/api/facilities?specialtyId=${specialty.id}`)
      .expect(200);
    expect(filtered.body.items.map((i: { id: string }) => i.id)).toContain(ref.facility.id);
    const unrelated = await request(server())
      .get('/api/facilities?specialtyId=00000000-0000-4000-8000-000000000000')
      .expect(200);
    expect(unrelated.body.items.map((i: { id: string }) => i.id)).not.toContain(ref.facility.id);
  });

  it('13. doctors can end an affiliation, then request a new one', async () => {
    const { doctor, affiliationId, ref } = await verifyDoctorFacilityAffiliation('f13');
    const ended = await mutate(
      doctor,
      'delete',
      `/api/facilities/${ref.facility.id}/affiliations/${affiliationId}`
    ).expect(200);
    expect(ended.body.status).toBe('ENDED');
    await mutate(
      doctor,
      'delete',
      `/api/facilities/${ref.facility.id}/affiliations/${affiliationId}`
    ).expect(409);

    const mine = await doctor.agent
      .get('/api/doctors/me/affiliations')
      .expect(200);
    expect(mine.body.some((a: { status: string }) => a.status === 'ENDED')).toBe(true);

    const renewed = await mutate(
      doctor,
      'post',
      `/api/facilities/${ref.facility.id}/affiliations`
    ).expect(201);
    expect(renewed.body.status).toBe('REQUESTED');
  });

  it('14. only admins grant and remove facility managers', async () => {
    const { facility } = await createFacility('f14');
    const bystander = await createUserAndSession('f14_by');
    await mutate(bystander, 'post', `/api/admin/facilities/${facility.id}/managers`)
      .send({ userId: bystander.userId })
      .expect(403);

    const admin = await createAdmin('f14_admin');
    const managerCandidate = await createUserAndSession('f14_mgr');
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/managers`)
      .send({ userId: managerCandidate.userId })
      .expect(201);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/managers`)
      .send({ userId: managerCandidate.userId })
      .expect(409);

    const manage = await managerCandidate.agent
      .get(`/api/facilities/${facility.id}/manage`)
      .expect(200);
    expect(manage.body.managers.map((m: { userId: string }) => m.userId)).toContain(
      managerCandidate.userId
    );

    await mutate(
      admin,
      'delete',
      `/api/admin/facilities/${facility.id}/managers/${managerCandidate.userId}`
    ).expect(200);
    await managerCandidate.agent
      .get(`/api/facilities/${facility.id}/manage`)
      .expect(403);
  });

  it('15. suspending a facility hides it and blocks new affiliations', async () => {
    const { admin, facility } = await verifyFacility('f15');
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/decision`)
      .send({ action: 'SUSPEND' })
      .expect(400);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/decision`)
      .send({ action: 'SUSPEND', reason: 'Suspension administrative.' })
      .expect(200);
    await mutate(admin, 'post', `/api/admin/facilities/${facility.id}/decision`)
      .send({ action: 'SUSPEND', reason: 'Deja suspendu.' })
      .expect(409);

    await request(server()).get(`/api/facilities/${facility.id}`).expect(404);

    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('f15_doctor', specialty.id);
    await mutate(doctor, 'post', `/api/facilities/${facility.id}/affiliations`)
      .expect(409);
  });

  it('16. doctor affiliations contract: empty for non-doctors, full history for doctors', async () => {
    // Un utilisateur non praticien (ici un patient) n'a aucune affiliation :
    // contrat intentionnel `200 []`, sans rejet ni fuite d'existence de profil.
    const patient = await createUserAndSession('f16_patient');
    const empty = await patient.agent
      .get('/api/doctors/me/affiliations')
      .expect(200);
    expect(empty.body).toEqual([]);

    // Un praticien voit l'historique complet, y compris les statuts non actifs.
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('f16_doctor', specialty.id);
    const { admin, facility } = await verifyFacility('f16');

    const requested = await mutate(
      doctor,
      'post',
      `/api/facilities/${facility.id}/affiliations`
    ).expect(201);
    const affiliationId = requested.body.id as string;

    const statusesOf = (body: Array<{ status: string }>): string[] =>
      body.map((a) => a.status);

    const afterRequest = await doctor.agent
      .get('/api/doctors/me/affiliations')
      .expect(200);
    expect(statusesOf(afterRequest.body)).toContain('REQUESTED');

    await mutate(
      admin,
      'post',
      `/api/admin/facility-affiliations/${affiliationId}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);
    const afterApprove = await doctor.agent
      .get('/api/doctors/me/affiliations')
      .expect(200);
    expect(statusesOf(afterApprove.body)).toContain('VERIFIED');

    await mutate(
      doctor,
      'delete',
      `/api/facilities/${facility.id}/affiliations/${affiliationId}`
    ).expect(200);
    const afterEnd = await doctor.agent
      .get('/api/doctors/me/affiliations')
      .expect(200);
    // L'affiliation cloturee est conservee (historique / audit).
    expect(statusesOf(afterEnd.body)).toContain('ENDED');
    expect(afterEnd.body).toHaveLength(1);
  });
});