import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MedicalRecordAccessAction, RecordGrantPermission, Role } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

// Les documents sont rejeta en cas d'incoherence contenu/declaration. Tous les
// cas critiques (depot, lecture, telechargement, archivage, refus, integrite et
// croisement de dossiers) sont couverts ici. La cle de stockage ne doit jamais
// sortir de l'API.

const VALID_PASSWORD = 'Passw0rd!2345';
const DENIED_MESSAGE = 'Access to this medical record is not authorized';
const DEFAULT_MAX_FILE_BYTES = 5 * 1024 * 1024;

function uniqueEmail(prefix: string): string {
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
  const entry = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1).split(';')[0] : undefined;
}

function pdfBuffer(size = 64): Buffer {
  const buffer = Buffer.alloc(Math.max(size, 8), 0x41);
  Buffer.from('%PDF-1.7\n%').copy(buffer, 0);
  return buffer;
}

function pngBuffer(): Buffer {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01
  ]);
}

function executableBuffer(): Buffer {
  return Buffer.from([0x4d, 0x5a, 0x90, 0x00, ...Buffer.alloc(16)]);
}

interface Session {
  userId: string;
  email: string;
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

const READ_DOCS: RecordGrantPermission[] = [RecordGrantPermission.VIEW_DOCUMENTS];
const DOCS_ACCESS: RecordGrantPermission[] = [
  RecordGrantPermission.VIEW_DOCUMENTS,
  RecordGrantPermission.WRITE_DOCUMENTS
];

describe('Medical documents (e2e)', () => {
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
    await rm(join(process.cwd(), 'storage', 'private-documents'), {
      recursive: true,
      force: true
    });
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

  async function seedSpecialty(name = 'Medecine interne') {
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

  async function grant(patient: Session, doctorProfileId: string, permissions: RecordGrantPermission[]) {
    return mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({ doctorProfileId, permissions, reason: 'Documents' })
      .expect(201);
  }

  function upload(
    session: Session,
    url: string,
    file: { buffer: Buffer; filename: string; contentType: string },
    fields: Record<string, string>
  ) {
    let builder = session.agent
      .post(url)
      .set('x-csrf-token', session.csrf)
      .field('category', fields.category);
    if (fields.encounterId) {
      builder = builder.field('encounterId', fields.encounterId);
    }
    return builder.attach('file', file.buffer, {
      filename: file.filename,
      contentType: file.contentType
    });
  }

  async function lastDoctorAccessEvent(
    patientUserId: string,
    action: MedicalRecordAccessAction
  ) {
    return prisma.medicalRecordAccessEvent.findFirst({
      where: { medicalRecord: { patientUserId }, action },
      orderBy: { createdAt: 'desc' }
    });
  }

  async function createRecord(patient: Session) {
    await patient.agent.get('/api/medical-records/me').expect(200);
    return prisma.medicalRecord.findUniqueOrThrow({
      where: { patientUserId: patient.userId }
    });
  }

  it('1. a patient can upload, list and read their own documents (no storage key leak)', async () => {
    const patient = await createUserAndSession('doc1_patient');

    const created = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'bilan.pdf', contentType: 'application/pdf' },
      { category: 'LAB_RESULT' }
    ).expect(201);

    const body = created.body as Record<string, unknown>;
    expect(body.storageKey).toBeUndefined();
    expect(body.originalName).toBe('bilan.pdf');
    expect(body.category).toBe('LAB_RESULT');
    expect(body.status).toBe('ACTIVE');
    expect(body.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body.uploaderDoctorProfileId).toBeNull();

    const list = await patient.agent
      .get('/api/medical-records/me/documents')
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect((list.body as { storageKey?: string }[])[0].storageKey).toBeUndefined();

    const meta = await patient.agent
      .get(`/api/medical-records/me/documents/${body.id}`)
      .expect(200);
    expect((meta.body as { id: string }).id).toBe(body.id);
    expect((meta.body as { storageKey?: string }).storageKey).toBeUndefined();

    const accessed = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_VIEWED');
    expect(accessed?.actorUserId).toBe(patient.userId);
    expect(accessed?.purpose).toBe('PATIENT_SELF');
  });

  it('2. a patient downloads their document with correct bytes and headers; download is audited', async () => {
    const patient = await createUserAndSession('doc2_patient');
    const payload = Buffer.concat([
      pngBuffer(),
      Buffer.alloc(1 * 1024 + 9, 0x42)
    ]);
    const created = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: payload, filename: 'radio.png', contentType: 'image/png' },
      { category: 'IMAGING' }
    ).expect(201);

    const download = await patient.agent
      .get(`/api/medical-records/me/documents/${created.body.id}/content`)
      .expect(200);
    expect(download.body).toEqual(payload);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['content-disposition']).toContain('radio.png');
    expect(download.headers['x-content-type-options']).toBe('nosniff');

    const downloaded = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_DOWNLOADED');
    expect(downloaded?.actorUserId).toBe(patient.userId);
    expect(downloaded?.purpose).toBe('PATIENT_SELF');
  });

  it('3. a patient archives a document: metadata updated, content no longer downloadable', async () => {
    const patient = await createUserAndSession('doc3_patient');
    const created = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'note.pdf', contentType: 'application/pdf' },
      { category: 'REPORT' }
    ).expect(201);

    const archived = await mutate(
      patient,
      'post',
      `/api/medical-records/me/documents/${created.body.id}/archive`
    )
      .send({ reason: 'Depose par erreur' })
      .expect(200);
    expect(archived.body.status).toBe('ARCHIVED');
    expect(archived.body.archiveReason).toBe('Depose par erreur');

    await patient.agent
      .get(`/api/medical-records/me/documents/${created.body.id}/content`)
      .expect(404);

    const list = await patient.agent
      .get('/api/medical-records/me/documents')
      .expect(200);
    expect(list.body[0].status).toBe('ARCHIVED');

    const archivedEvent = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_ARCHIVED');
    expect(archivedEvent?.actorUserId).toBe(patient.userId);
  });

  it('4. an upload without a file is refused and audited (DOCUMENT_REJECTED)', async () => {
    const patient = await createUserAndSession('doc4_patient');
    await mutate(patient, 'post', '/api/medical-records/me/documents')
      .field('category', 'OTHER')
      .expect(400);

    const rejected = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_REJECTED');
    expect(rejected?.reason).toBe('empty_file');
  });

  it('5. an oversized file is refused with 413 and audited', async () => {
    const patient = await createUserAndSession('doc5_patient');
    const oversized = pdfBuffer(DEFAULT_MAX_FILE_BYTES + 128);

    const response = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: oversized, filename: 'mega.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    );
    expect(response.status).toBe(413);

    const rejected = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_REJECTED');
    expect(rejected?.reason).toBe('file_too_large');

    const list = await patient.agent
      .get('/api/medical-records/me/documents')
      .expect(200);
    expect(list.body).toHaveLength(0);
  });

  it('6. a declared type that contradicts the content is refused and audited', async () => {
    const patient = await createUserAndSession('doc6_patient');
    const response = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'faux.png', contentType: 'image/png' },
      { category: 'IMAGING' }
    );
    expect(response.status).toBe(400);

    const rejected = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_REJECTED');
    expect(rejected?.reason).toBe('type_mismatch');
  });

  it('7. non-document content (executable) is refused with 415 and audited', async () => {
    const patient = await createUserAndSession('doc7_patient');
    const response = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: executableBuffer(), filename: 'tool.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    );
    expect(response.status).toBe(415);

    const rejected = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_REJECTED');
    expect(rejected?.reason).toBe('unsupported_type');
  });

  it('8. a doctor without any grant cannot list, download or upload', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('doc8_doctor', specialty.id);
    const patient = await createUserAndSession('doc8_patient');
    await createRecord(patient);

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents`)
      .expect(403);
    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents/does-not-exist/content`)
      .expect(403);

    const response = await upload(
      doctor,
      `/api/medical-records/patients/${patient.userId}/documents`,
      { buffer: pdfBuffer(), filename: 'x.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    );
    expect(response.status).toBe(403);
    expect(response.body.message).toBe(DENIED_MESSAGE);

    const denied = await lastDoctorAccessEvent(patient.userId, 'ACCESS_DENIED');
    expect(denied?.actorDoctorProfileId).not.toBeNull();
  });

  it('9. VIEW_DOCUMENTS allows reading and downloading but never uploading or archiving', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('doc9_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('doc9_patient');

    const created = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'bilan.pdf', contentType: 'application/pdf' },
      { category: 'LAB_RESULT' }
    ).expect(201);

    await grant(patient, doctorProfileId, READ_DOCS);

    const list = await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const meta = await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents/${created.body.id}`)
      .expect(200);
    expect(meta.body.id).toBe(created.body.id);

    const download = await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents/${created.body.id}/content`)
      .expect(200);
    expect((download.body as Buffer).length).toBe(pdfBuffer().length);

    const writeDenied = await upload(
      doctor,
      `/api/medical-records/patients/${patient.userId}/documents`,
      { buffer: pdfBuffer(), filename: 'write.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    );
    expect(writeDenied.status).toBe(403);

    const archiveDenied = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/documents/${created.body.id}/archive`
    ).send({});
    expect(archiveDenied.status).toBe(403);

    const downloaded = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_DOWNLOADED');
    expect(downloaded?.actorUserId).toBe(doctor.userId);
    expect(downloaded?.purpose).toBe('EXPLICIT_GRANT');
  });

  it('10. VIEW + WRITE lets a doctor upload; the encounter link is validated; an upload is audited', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('doc10_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('doc10_patient');
    await grant(patient, doctorProfileId, [
      ...READ_DOCS,
      RecordGrantPermission.WRITE_DOCUMENTS,
      RecordGrantPermission.WRITE_ENCOUNTERS
    ]);

    const otherPatient = await createUserAndSession('doc10_other');

    // Encounter du mauvais dossier : refus.
    const encounter = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters`
    )
      .send({ occurredAt: new Date().toISOString() })
      .expect(201);
    const otherRecord = await createRecord(otherPatient);
    const otherEncounter = await prisma.clinicalEncounter.create({
      data: {
        medicalRecordId: otherRecord.id,
        doctorProfileId,
        occurredAt: new Date()
      }
    });

    const badLink = await upload(
      doctor,
      `/api/medical-records/patients/${patient.userId}/documents`,
      { buffer: pdfBuffer(), filename: 'linked.pdf', contentType: 'application/pdf' },
      { category: 'REPORT', encounterId: otherEncounter.id }
    );
    expect(badLink.status).toBe(400);

    const created = await upload(
      doctor,
      `/api/medical-records/patients/${patient.userId}/documents`,
      { buffer: pdfBuffer(), filename: 'linked.pdf', contentType: 'application/pdf' },
      { category: 'REPORT', encounterId: encounter.body.id as string }
    ).expect(201);
    expect(created.body.uploaderDoctorProfileId).toBe(doctorProfileId);
    expect(created.body.encounterId).toBe(encounter.body.id);

    const uploaded = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_UPLOADED');
    expect(uploaded?.actorUserId).toBe(doctor.userId);
    expect(uploaded?.purpose).toBe('EXPLICIT_GRANT');
    expect(uploaded?.targetId).toBe(created.body.id);
  });

  it('11. an archived document is no longer downloadable by an authorized doctor', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('doc11_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patient = await createUserAndSession('doc11_patient');
    await grant(patient, doctorProfileId, DOCS_ACCESS);

    const created = await upload(
      doctor,
      `/api/medical-records/patients/${patient.userId}/documents`,
      { buffer: pdfBuffer(), filename: 'to-archive.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    ).expect(201);

    const archived = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/documents/${created.body.id}/archive`
    )
      .send({ reason: 'Erreur de depot' })
      .expect(200);
    expect(archived.body.status).toBe('ARCHIVED');

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents/${created.body.id}/content`)
      .expect(404);

    const archivedEvent = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_ARCHIVED');
    expect(archivedEvent?.actorUserId).toBe(doctor.userId);
  });

  it('12. document access is strictly per-record (no cross-patient identifier reuse)', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('doc12_doctor', specialty.id);
    const doctorProfileId = await doctorProfileIdOf(doctor.userId);
    const patientA = await createUserAndSession('doc12_a');
    const patientB = await createUserAndSession('doc12_b');

    const docA = await upload(
      patientA,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'a.pdf', contentType: 'application/pdf' },
      { category: 'REPORT' }
    ).expect(201);

    const docB = await upload(
      patientB,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'b.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    ).expect(201);

    // Le praticien autorise pour A ne voit ni le document de B (404),
    // ni le dossier de B (403).
    await grant(patientA, doctorProfileId, READ_DOCS);
    await doctor.agent
      .get(`/api/medical-records/patients/${patientA.userId}/documents/${docA.body.id}`)
      .expect(200);
    await doctor.agent
      .get(`/api/medical-records/patients/${patientA.userId}/documents/${docA.body.id}/content`)
      .expect(200);

    await doctor.agent
      .get(`/api/medical-records/patients/${patientA.userId}/documents/${docB.body.id}`)
      .expect(404);
    await doctor.agent
      .get(`/api/medical-records/patients/${patientA.userId}/documents/${docB.body.id}/content`)
      .expect(404);
    await doctor.agent
      .get(`/api/medical-records/patients/${patientB.userId}/documents`)
      .expect(403);
  });

  it('13. emergency access allows document reads and downloads but never writes', async () => {
    const specialty = await seedSpecialty();
    const doctor = await createVerifiedDoctor('doc13_doctor', specialty.id);
    const patient = await createUserAndSession('doc13_patient');

    const created = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'urgence.pdf', contentType: 'application/pdf' },
      { category: 'REPORT' }
    ).expect(201);

    await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/emergency-access`
    )
      .send({
        justification:
          'Patient admis inconscient : besoin des derniers documents.'
      })
      .expect(201);

    await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents`)
      .expect(200);
    const download = await doctor.agent
      .get(`/api/medical-records/patients/${patient.userId}/documents/${created.body.id}/content`)
      .expect(200);
    expect((download.body as Buffer).length).toBe(pdfBuffer().length);

    const writeDenied = await upload(
      doctor,
      `/api/medical-records/patients/${patient.userId}/documents`,
      { buffer: pdfBuffer(), filename: 'no.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    );
    expect(writeDenied.status).toBe(403);

    const downloaded = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_DOWNLOADED');
    expect(downloaded?.purpose).toBe('EMERGENCY');
  });

  it('14. a tampered stored file fails the integrity check on download', async () => {
    const patient = await createUserAndSession('doc14_patient');
    const created = await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'intact.pdf', contentType: 'application/pdf' },
      { category: 'OTHER' }
    ).expect(201);

    // Simule une alteration du contenu sur le disque (stockage local prive).
    const doc = await prisma.medicalDocument.findFirstOrThrow({
      where: { id: created.body.id as string }
    });
    const storageRoot = join(process.cwd(), 'storage', 'private-documents');
    const onDisk = join(storageRoot, doc.storageKey);
    await writeFile(onDisk, Buffer.from('BAM altéré!'));

    const download = await patient.agent
      .get(`/api/medical-records/me/documents/${doc.id}/content`)
      .expect(500);

    const rejected = await lastDoctorAccessEvent(patient.userId, 'DOCUMENT_REJECTED');
    expect(rejected?.reason).toBe('integrity_failure');
    expect(download.body.message).toContain('integrity');
  });
});