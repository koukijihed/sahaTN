import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FacilitySector, Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

const VALID_PASSWORD = 'Passw0rd!2345';

function uniqueEmail(prefix = 'search'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}@example.tn`;
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

describe('National search (e2e)', () => {
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
    specialtyId: string,
    options: {
      displayName?: string;
      languages?: string[];
      listed?: boolean;
    } = {}
  ): Promise<Session & { profileId: string }> {
    const doctor = await createUserAndSession(prefix);
    await mutate(doctor, 'put', '/api/doctors/me')
      .send({
        displayName: options.displayName ?? `Dr ${prefix}`,
        professionalDescription: 'Praticien teste.',
        languages: options.languages ?? ['fr', 'ar'],
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

    const profile = await prisma.doctorProfile.findUniqueOrThrow({
      where: { userId: doctor.userId }
    });
    const requestRow = await prisma.doctorVerificationRequest.findFirstOrThrow({
      where: { doctorProfileId: profile.id },
      orderBy: { createdAt: 'desc' }
    });
    const admin = await createAdmin(`${prefix}_admin`);
    await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${requestRow.id}/decision`
    )
      .send({ action: 'START_REVIEW' })
      .expect(200);
    await mutate(
      admin,
      'post',
      `/api/admin/doctor-verifications/${requestRow.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);
    // La recherche publique exige VERIFIE ET publiquement liste.
    if (options.listed !== false) {
      await mutate(doctor, 'put', '/api/doctors/me/visibility')
        .send({ listed: true })
        .expect(200);
    }
    return { ...doctor, profileId: profile.id };
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
    doctor: Session & { profileId: string };
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

  it('1. search doctors by name', async () => {
    const specialty = await seedSpecialty();
    const stamp = Date.now();
    await createVerifiedDoctor('s1_target', specialty.id, {
      displayName: `Dr Nassira ${stamp}`
    });
    await createVerifiedDoctor('s1_other', specialty.id, {
      displayName: `Dr Youssef ${stamp}`
    });

    const res = await request(server())
      .get(`/api/doctors?q=Nassira%20${stamp}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].displayName).toBe(`Dr Nassira ${stamp}`);

    const all = await request(server()).get(`/api/doctors?q=${stamp}`).expect(200);
    expect(all.body.total).toBe(2);
  });

  it('2. search by specialty', async () => {
    const cardio = await seedSpecialty('Cardiologie');
    const dermato = await seedSpecialty('Dermatologie');
    const stamp = Date.now();
    await createVerifiedDoctor(`s2_cardio_${stamp}`, cardio.id);
    await createVerifiedDoctor(`s2_der_${stamp}`, dermato.id);

    const res = await request(server())
      .get(`/api/doctors?specialtyId=${cardio.id}`)
      .expect(200);
    expect(res.body.items.every((i: { id: string }) => i.id)).toBe(true);
    const cardioItems = res.body.items as { id: string }[];
    const dermatoRes = await request(server())
      .get(`/api/doctors?specialtyId=${dermato.id}`)
      .expect(200);
    const dermatoItems = dermatoRes.body.items as { id: string }[];

    expect(cardioItems.length).toBeGreaterThanOrEqual(1);
    expect(dermatoItems.length).toBeGreaterThanOrEqual(1);
    const ids = dermatoItems.map((i) => i.id);
    for (const item of cardioItems) {
      expect(ids).not.toContain(item.id);
    }
  });

  it('3. sector filter (public/private) on doctors and facilities', async () => {
    const { doctor } = await verifyDoctorFacilityAffiliation('s3');

    // Le medecin est affilie a une clinique PRIVATE a Tunis.
    const privateRes = await request(server())
      .get(`/api/doctors?sector=${FacilitySector.PRIVATE}`)
      .expect(200);
    const privateIds = privateRes.body.items as { id: string }[];
    expect(privateIds.some((i) => i.id === doctor.profileId)).toBe(true);

    const publicRes = await request(server())
      .get(`/api/doctors?sector=${FacilitySector.PUBLIC}`)
      .expect(200);
    const publicIds = publicRes.body.items as { id: string }[];
    expect(publicIds.some((i) => i.id === doctor.profileId)).toBe(false);

    // Cote etablissements : la clinique est PRIVATE.
    const facilityRes = await request(server())
      .get('/api/facilities?sector=PRIVATE')
      .expect(200);
    expect(
      facilityRes.body.items.every(
        (i: { sector: string }) => i.sector === 'PRIVATE'
      )
    ).toBe(true);
  });

  it('4. governorate filter', async () => {
    const { doctor, ref } = await verifyDoctorFacilityAffiliation('s4');

    const byGovernorate = await request(server())
      .get('/api/doctors?governorate=TUNIS')
      .expect(200);
    expect(
      (byGovernorate.body.items as { id: string }[]).some(
        (i) => i.id === doctor.profileId
      )
    ).toBe(true);

    const excluded = await request(server())
      .get('/api/doctors?governorate=SFAX')
      .expect(200);
    expect(
      (excluded.body.items as { id: string }[]).some(
        (i) => i.id === doctor.profileId
      )
    ).toBe(false);

    const facilities = await request(server())
      .get('/api/facilities?governorate=TUNIS')
      .expect(200);
    expect(
      facilities.body.items.some(
        (i: { id: string }) => i.id === ref.facility.id
      )
    ).toBe(true);
  });

  it('5. pagination and maximum limit are controlled', async () => {
    await request(server()).get('/api/doctors?limit=0').expect(400);
    await request(server()).get('/api/doctors?limit=51').expect(400);
    await request(server()).get('/api/facilities?limit=51').expect(400);
    await request(server()).get('/api/search?limit=51').expect(400);

    const res = await request(server())
      .get('/api/doctors?page=2&limit=1')
      .expect(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(1);
    expect(res.body.items.length).toBeLessThanOrEqual(1);

    const deep = await request(server())
      .get('/api/doctors?page=99999')
      .expect(200);
    expect(deep.body.items).toEqual([]);
    expect(deep.body.total).toBeGreaterThanOrEqual(0);
  });

  it('6. invalid parameters are rejected', async () => {
    await request(server()).get('/api/doctors?governorate=ATLANTIQUE').expect(400);
    await request(server()).get('/api/doctors?sort=bogus').expect(400);
    await request(server()).get('/api/doctors?specialtyId=not-a-uuid').expect(400);
    await request(server()).get('/api/facilities?specialtyId=not-a-uuid').expect(400);
    await request(server()).get('/api/facilities?sort=bogus').expect(400);
    await request(server()).get('/api/search?type=something').expect(400);
    await request(server()).get('/api/doctors?q='.concat('a'.repeat(121))).expect(400);

    const availability = await request(server())
      .get('/api/doctors?availability=true')
      .expect(400);
    expect(availability.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('agenda')])
    );
  });

  it('7. only verified AND listed doctors are returned', async () => {
    const specialty = await seedSpecialty();
    const stamp = Date.now();
    const visible = await createVerifiedDoctor(`s7_visible_${stamp}`, specialty.id);

    // Un profil cree mais jamais soumis / verifie.
    const unverified = await createUserAndSession(`s7_unverified_${stamp}`);
    await mutate(unverified, 'put', '/api/doctors/me')
      .send({
        displayName: `Dr Cache ${stamp}`,
        languages: ['fr'],
        specialtyIds: [specialty.id]
      })
      .expect(200);

    // Un profil verifie mais non publie (isPubliclyListed = false).
    const verified = await createVerifiedDoctor(`s7_hidden_${stamp}`, specialty.id, {
      listed: false
    });

    const res = await request(server())
      .get(`/api/doctors?q=${stamp}`)
      .expect(200);

    const ids = res.body.items.map((i: { id: string }) => i.id);
    expect(ids).toContain(visible.profileId);
    expect(ids).not.toContain(unverified.userId);
    expect(ids).not.toContain(verified.profileId);
  });

  it('8. only verified AND listed facilities are returned', async () => {
    const { ref } = await verifyDoctorFacilityAffiliation('s8');
    const { facility: draftFacility } = await createFacility('s8_draft');

    const res = await request(server()).get('/api/facilities').expect(200);
    const ids = (res.body.items as { id: string }[]).map((i) => i.id);
    expect(ids).toContain(ref.facility.id);
    expect(ids).not.toContain(draftFacility.id);
    await request(server()).get(`/api/facilities/${draftFacility.id}`).expect(404);
    await request(server()).get(`/api/doctors?facilityId=${draftFacility.id}`).expect(200)
      .then((r) => expect(r.body.total).toBe(0));
  });

  it('9. only VERIFIED affiliations are exposed', async () => {
    const specialty = await seedSpecialty();
    const refA = await verifyFacility('s9_a');
    const refB = await verifyFacility('s9_b');
    const doctor = await createVerifiedDoctor('s9_doctor', specialty.id);

    // Affiliation VERIFIEE vers A.
    const aff = await mutate(
      doctor,
      'post',
      `/api/facilities/${refA.facility.id}/affiliations`
    ).expect(201);
    await mutate(
      refA.admin,
      'post',
      `/api/admin/facility-affiliations/${aff.body.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);

    // Affiliation simplement DEMANDEE (REQUESTED) vers B : ne doit jamais
    // apparaitre ni filter les medecins.
    await mutate(
      doctor,
      'post',
      `/api/facilities/${refB.facility.id}/affiliations`
    ).expect(201);

    const byA = await request(server())
      .get(`/api/doctors?facilityId=${refA.facility.id}`)
      .expect(200);
    expect(
      (byA.body.items as { id: string }[]).some((i) => i.id === doctor.profileId)
    ).toBe(true);

    const byB = await request(server())
      .get(`/api/doctors?facilityId=${refB.facility.id}`)
      .expect(200);
    expect(
      (byB.body.items as { id: string }[]).some((i) => i.id === doctor.profileId)
    ).toBe(false);

    const detail = await request(server())
      .get(`/api/doctors/${doctor.profileId}`)
      .expect(200);
    const facilities = detail.body.profile.practiceFacilities as {
      id: string;
    }[];
    expect(facilities.map((f) => f.id)).toEqual([refA.facility.id]);

    // Un etablissement ne filtre les medecins que par ses affiliations
    // VERIFIEES : B n'a aucun medecin affilie valide.
    const facilityBDocs = await request(server())
      .get(`/api/facilities/${refB.facility.id}`)
      .expect(200);
    expect(facilityBDocs.body.verifiedAffiliations ?? []).toEqual([]);
  });

  it('10. no private data leaks in search results', async () => {
    const { doctor, ref } = await verifyDoctorFacilityAffiliation('s10');

    const doctorRes = await request(server()).get('/api/doctors').expect(200);
    const item = (doctorRes.body.items as Record<string, unknown>[]).find(
      (i) => i.id === doctor.profileId
    );
    expect(item).toBeDefined();
    for (const key of ['email', 'userId', 'verificationStatus', 'credentials',
      'isPubliclyListed', 'createdBy', 'phone', 'licenseReference']) {
      expect(item).not.toHaveProperty(key);
    }

    const detail = await request(server())
      .get(`/api/doctors/${doctor.profileId}`)
      .expect(200);
    for (const key of ['email', 'userId', 'verificationStatus', 'credentials',
      'isPubliclyListed']) {
      expect(detail.body.profile).not.toHaveProperty(key);
    }

    const facilitiesRes = await request(server()).get('/api/facilities').expect(200);
    const facilityItem = (facilitiesRes.body.items as Record<string, unknown>[]).find(
      (i) => i.id === ref.facility.id
    );
    expect(facilityItem).toBeDefined();
    for (const key of ['licenseReference', 'sourceReference', 'verificationStatus',
      'managers', 'latestVerificationRequest']) {
      expect(facilityItem).not.toHaveProperty(key);
    }
  });

  it('11. empty results', async () => {
    const query = `q=zzzznothing${Date.now()}`;
    const doctors = await request(server())
      .get(`/api/doctors?${query}`)
      .expect(200);
    expect(doctors.body.total).toBe(0);
    expect(doctors.body.items).toEqual([]);

    const facilities = await request(server())
      .get(`/api/facilities?${query}`)
      .expect(200);
    expect(facilities.body.total).toBe(0);

    const search = await request(server()).get(`/api/search?${query}`).expect(200);
    expect(search.body.doctors.total).toBe(0);
    expect(search.body.facilities.total).toBe(0);
  });

  it('12. combined search reuses public services without regression', async () => {
    const { doctor, ref } = await verifyDoctorFacilityAffiliation('s12');

    const all = await request(server())
      .get('/api/search?type=all')
      .expect(200);
    expect(all.body.doctors).not.toBeNull();
    expect(all.body.facilities).not.toBeNull();
    expect(all.body.query.type).toBe('all');
    expect(
      (all.body.doctors.items as { id: string }[]).some(
        (i) => i.id === doctor.profileId
      )
    ).toBe(true);
    expect(
      (all.body.facilities.items as { id: string }[]).some(
        (i) => i.id === ref.facility.id
      )
    ).toBe(true);

    const onlyDoctors = await request(server())
      .get('/api/search?type=doctors')
      .expect(200);
    expect(onlyDoctors.body.doctors).not.toBeNull();
    expect(onlyDoctors.body.facilities).toBeNull();

    const onlyFacilities = await request(server())
      .get('/api/search?type=facilities')
      .expect(200);
    expect(onlyFacilities.body.facilities).not.toBeNull();
    expect(onlyFacilities.body.doctors).toBeNull();

    // Non-regression des endpoints publics existants.
    await request(server()).get('/api/specialties').expect(200);
    const profile = await request(server())
      .get(`/api/doctors/${doctor.profileId}`)
      .expect(200);
    expect(profile.body.profile.displayName).toBeTruthy();
    await request(server()).get(`/api/facilities/${ref.facility.id}`).expect(200);
  });

  it('13. search works with demo-like data (verified doctor + verified facility)', async () => {
    // Reproduit l'etat cree par le seed (ADR-0007) : medecin verifie et liste,
    // etablissement verifie et liste, affiliation verifiee entre les deux.
    const specialty = await seedSpecialty('Medecine generale');
    const ref = await verifyFacility('s13_h');
    const doctor = await createVerifiedDoctor('s13_doctor', specialty.id);
    const aff = await mutate(
      doctor,
      'post',
      `/api/facilities/${ref.facility.id}/affiliations`
    ).expect(201);
    await mutate(
      ref.admin,
      'post',
      `/api/admin/facility-affiliations/${aff.body.id}/decision`
    )
      .send({ action: 'APPROVE' })
      .expect(200);

    const doctors = await request(server())
      .get(`/api/doctors?specialtyId=${specialty.id}`)
      .expect(200);
    expect(
      (doctors.body.items as { id: string }[]).some(
        (i) => i.id === doctor.profileId
      )
    ).toBe(true);

    const combined = await request(server())
      .get(`/api/search?q=${encodeURIComponent('Clinique')}`)
      .expect(200);
    expect(
      (combined.body.facilities.items as { id: string }[]).some(
        (i) => i.id === ref.facility.id
      )
    ).toBe(true);

    // Le profil public deduit le lieu d'exercice de l'affiliation VERIFIEE.
    const detail = await request(server())
      .get(`/api/doctors/${doctor.profileId}`)
      .expect(200);
    expect(detail.body.profile.practiceFacilities).toHaveLength(1);
    expect(detail.body.profile.practiceFacilities[0].id).toBe(ref.facility.id);
  });

  it('14. no fake availability indicators', async () => {
    await request(server()).get('/api/search?availability=any').expect(400);
    await request(server()).get('/api/facilities?availability=any').expect(400);
    // Toute tentative d'invoquer un filtre de disponibilite inconnu est rejetee
    // (forbidNonWhitelisted) : aucun creneau n'est jamais simule.
    await request(server()).get('/api/doctors?date=2026-01-01').expect(400);

    const { doctor } = await verifyDoctorFacilityAffiliation('s14');
    const res = await request(server())
      .get(`/api/doctors/${doctor.profileId}`)
      .expect(200);
    expect(res.body.profile).not.toHaveProperty('availability');
    expect(res.body.profile).not.toHaveProperty('nextAvailableSlot');
    expect(res.body.profile).not.toHaveProperty('bookingAvailable');
    expect(JSON.stringify(res.body)).not.toContain('disponibleImmediatement');
  });

  it('15. language filter is validated and applied', async () => {
    const specialty = await seedSpecialty('Pediatrie');
    const stamp = Date.now();
    await createVerifiedDoctor(`s15_fr_${stamp}`, specialty.id, {
      displayName: `Dr Leila ${stamp}`,
      languages: ['fr']
    });
    await createVerifiedDoctor(`s15_ar_${stamp}`, specialty.id, {
      displayName: `Dr Sami ${stamp}`,
      languages: ['ar']
    });

    await request(server()).get('/api/doctors?language=xx').expect(400);

    const inFrench = await request(server())
      .get(`/api/doctors?q=${stamp}&language=fr`)
      .expect(200);
    const frenchNames = (inFrench.body.items as { displayName: string }[]).map(
      (i) => i.displayName
    );
    expect(frenchNames).toContain(`Dr Leila ${stamp}`);
    expect(frenchNames).not.toContain(`Dr Sami ${stamp}`);
  });
});