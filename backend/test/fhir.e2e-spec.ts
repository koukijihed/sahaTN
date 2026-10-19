import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MedicalRecordAccessAction, RecordGrantPermission } from '@prisma/client';
import cookieParser from 'cookie-parser';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateFhirBundle } from '../src/modules/fhir/fhir-validation';
import { validateFhirBundleAgainstSchema } from '../src/modules/fhir/fhir-schema-validation';
import { DEMO_BUNDLE_ID } from '../src/modules/fhir/demo/demo-data';
import type { FhirBundle } from '../src/modules/fhir/fhir.types';

const VALID_PASSWORD = 'Passw0rd!2345';
const DENIED_MESSAGE = 'Access to this medical record is not authorized';

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

interface Session {
  userId: string;
  email: string;
  agent: ReturnType<typeof request.agent>;
  csrf: string;
}

function resourceTypes(bundle: FhirBundle): string[] {
  return (bundle.entry ?? []).map((entry) => entry.resource.resourceType);
}

describe('FHIR interoperability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const tempStorageDir = join(process.cwd(), 'test', '.tmp-fhir-storage');

  beforeAll(async () => {
    // Isole les documents uploades par les tests hors du repertoire courant.
    process.env.DOCUMENT_STORAGE_DIR = tempStorageDir;
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
    await rm(tempStorageDir, { recursive: true, force: true });
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

  async function createVerifiedDoctor(prefix: string) {
    const session = await createUserAndSession(prefix);
    const profile = await prisma.doctorProfile.create({
      data: {
        userId: session.userId,
        displayName: `Dr ${prefix}`,
        languages: ['fr'],
        verificationStatus: 'VERIFIED'
      }
    });
    return { session, doctorProfileId: profile.id };
  }

  function pdfBuffer(size = 64): Buffer {
    const buffer = Buffer.alloc(Math.max(size, 8), 0x41);
    Buffer.from('%PDF-1.7\n%').copy(buffer, 0);
    return buffer;
  }

  function upload(
    session: Session,
    url: string,
    file: { buffer: Buffer; filename: string; contentType: string },
    fields: { category: string }
  ) {
    return session.agent
      .post(url)
      .set('x-csrf-token', session.csrf)
      .field('category', fields.category)
      .attach('file', file.buffer, {
        filename: file.filename,
        contentType: file.contentType
      });
  }

  function collectReferences(bundle: FhirBundle): string[] {
    const references: string[] = [];
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(visit);
        return;
      }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (typeof record.reference === 'string') {
          references.push(record.reference);
        }
        Object.values(record).forEach(visit);
      }
    };
    visit(bundle);
    return references;
  }

  it('1. requires authentication for the demo export', async () => {
    await request(server()).get('/api/fhir/demo/bundle').expect(401);
  });

  it('2. exposes a deterministic, structurally valid demo bundle', async () => {
    const user = await createUserAndSession('fhir_demo');
    const first = await user.agent.get('/api/fhir/demo/bundle').expect(200);
    const second = await user.agent.get('/api/fhir/demo/bundle').expect(200);

    expect(first.body).toEqual(second.body);
    expect(validateFhirBundle(first.body)).toEqual([]);
    expect(validateFhirBundleAgainstSchema(first.body)).toEqual([]);
    expect(resourceTypes(first.body as FhirBundle)).toEqual(
      expect.arrayContaining([
        'Patient',
        'Practitioner',
        'Organization',
        'Encounter',
        'Observation',
        'Condition',
        'AllergyIntolerance',
        'DocumentReference'
      ])
    );
    const serialized = JSON.stringify(first.body);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('private-documents');
  });

  it('3. denies a professional export without a grant and returns no clinical data', async () => {
    const patient = await createUserAndSession('fhir_deny_patient');
    const { session: doctor } = await createVerifiedDoctor('fhir_deny_doctor');

    await patient.agent.get('/api/medical-records/me').expect(200);

    const denied = await doctor.agent
      .get(`/api/fhir/patients/${patient.userId}/bundle`)
      .expect(403);
    expect(denied.body.message).toBe(DENIED_MESSAGE);
    expect(JSON.stringify(denied.body)).not.toContain('Observation');
    expect(JSON.stringify(denied.body)).not.toContain('Encounter');
  });

  it('4. exports only the patient own record via the self endpoint', async () => {
    const patient = await createUserAndSession('fhir_self_patient');
    const { session: doctor, doctorProfileId } = await createVerifiedDoctor(
      'fhir_self_doctor'
    );
    await mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({
        doctorProfileId,
        permissions: [
          RecordGrantPermission.VIEW_RECORD,
          RecordGrantPermission.VIEW_ENCOUNTERS,
          RecordGrantPermission.VIEW_OBSERVATIONS,
          RecordGrantPermission.WRITE_ENCOUNTERS,
          RecordGrantPermission.WRITE_OBSERVATIONS
        ],
        reason: 'Suivi'
      })
      .expect(201);

    const encounter = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters`
    )
      .send({ occurredAt: new Date().toISOString(), chiefComplaint: 'Cephalees' })
      .expect(201);

    const bundle = (await patient.agent.get('/api/fhir/me/bundle').expect(200))
      .body as FhirBundle;
    expect(validateFhirBundle(bundle)).toEqual([]);
    const patientResource = bundle.entry?.find(
      (entry) => entry.resource.resourceType === 'Patient'
    )?.resource;
    expect(patientResource?.id).toBe(patient.userId);
    expect(
      bundle.entry?.some(
        (entry) =>
          entry.resource.resourceType === 'Encounter' &&
          entry.resource.id === (encounter.body.id as string)
      )
    ).toBe(true);

    // E-mail / telephone ne doivent jamais apparaitre comme identifiants.
    const identifiers = JSON.stringify(
      (patientResource as { identifier?: unknown }).identifier ?? []
    );
    expect(identifiers).not.toContain(patient.email);
  });

  it('5. gates professional export sections by granted permissions', async () => {
    const patient = await createUserAndSession('fhir_grant_patient');
    const { session: doctor, doctorProfileId } = await createVerifiedDoctor(
      'fhir_grant_doctor'
    );
    await mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({
        doctorProfileId,
        permissions: [
          RecordGrantPermission.VIEW_RECORD,
          RecordGrantPermission.VIEW_ENCOUNTERS,
          RecordGrantPermission.VIEW_OBSERVATIONS,
          RecordGrantPermission.WRITE_ENCOUNTERS,
          RecordGrantPermission.WRITE_OBSERVATIONS
        ],
        reason: 'Suivi'
      })
      .expect(201);

    const encounter = await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters`
    )
      .send({ occurredAt: new Date().toISOString(), chiefComplaint: 'Toux' })
      .expect(201);
    await mutate(
      doctor,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters/${encounter.body.id}/observations`
    )
      .send({
        category: 'SYMPTOM',
        label: 'Toux seche',
        valueText: 'presente',
        observedAt: new Date().toISOString()
      })
      .expect(201);

    const bundle = (
      await doctor.agent
        .get(`/api/fhir/patients/${patient.userId}/bundle`)
        .expect(200)
    ).body as FhirBundle;

    expect(validateFhirBundle(bundle)).toEqual([]);
    const types = resourceTypes(bundle);
    expect(types).toContain('Encounter');
    expect(types).toContain('Observation');
    // Aucune permission sur diagnostics/documents/allergies : sections omises.
    expect(types).not.toContain('Condition');
    expect(types).not.toContain('DocumentReference');
    expect(types).not.toContain('AllergyIntolerance');

    // Chaque reference doit pointer vers une ressource presente.
    const known = new Set(
      (bundle.entry ?? []).map(
        (entry) => `${entry.resource.resourceType}/${entry.resource.id}`
      )
    );
    const references: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (typeof record.reference === 'string') {
          references.push(record.reference);
        }
        Object.values(record).forEach(collect);
      }
    };
    collect(bundle);
    references.forEach((reference) => expect(known.has(reference)).toBe(true));
  });

  it('6. does not expose internal access logs in a patient bundle', async () => {
    const patient = await createUserAndSession('fhir_log_patient');
    const bundle = (await patient.agent.get('/api/fhir/me/bundle').expect(200))
      .body as FhirBundle;
    expect(resourceTypes(bundle)).not.toContain('AuditEvent');
    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain('MedicalRecordAccessEvent');
    expect(serialized).not.toContain('tokenHash');
  });

  it('7. a patient cannot export another patient record via the professional endpoint', async () => {
    const patientA = await createUserAndSession('fhir_xtalk_a');
    const patientB = await createUserAndSession('fhir_xtalk_b');
    await patientB.agent.get('/api/medical-records/me').expect(200);

    const denied = await patientA.agent
      .get(`/api/fhir/patients/${patientB.userId}/bundle`)
      .expect(403);
    expect(denied.body.message).toBe(DENIED_MESSAGE);
    expect(JSON.stringify(denied.body)).not.toContain('Observation');
  });

  it('8. rejects unauthenticated access to protected exports', async () => {
    await request(server()).get('/api/fhir/me/bundle').expect(401);
    await request(server())
      .get('/api/fhir/patients/00000000-0000-4000-8000-000000000000/bundle')
      .expect(401);
  });

  it('9. a care relationship alone does not authorize an export', async () => {
    const patient = await createUserAndSession('fhir_rel_patient');
    const { session: doctor, doctorProfileId } = await createVerifiedDoctor(
      'fhir_rel_doctor'
    );
    await patient.agent.get('/api/medical-records/me').expect(200);
    await prisma.careRelationship.create({
      data: {
        patientUserId: patient.userId,
        doctorProfileId,
        source: 'APPOINTMENT'
      }
    });

    await doctor.agent
      .get(`/api/fhir/patients/${patient.userId}/bundle`)
      .expect(403);
  });

  it('10. never emits references to resources excluded by permissions', async () => {
    const patient = await createUserAndSession('fhir_ref_patient');
    const { session: full, doctorProfileId: fullId } = await createVerifiedDoctor(
      'fhir_ref_full'
    );
    const { session: limited, doctorProfileId: limitedId } =
      await createVerifiedDoctor('fhir_ref_limited');

    await mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({
        doctorProfileId: fullId,
        permissions: [
          RecordGrantPermission.VIEW_RECORD,
          RecordGrantPermission.VIEW_ENCOUNTERS,
          RecordGrantPermission.VIEW_OBSERVATIONS,
          RecordGrantPermission.WRITE_ENCOUNTERS,
          RecordGrantPermission.WRITE_OBSERVATIONS
        ],
        reason: 'Soins'
      })
      .expect(201);
    await mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({
        doctorProfileId: limitedId,
        permissions: [
          RecordGrantPermission.VIEW_RECORD,
          RecordGrantPermission.VIEW_OBSERVATIONS
        ],
        reason: 'Lecture ciblee'
      })
      .expect(201);

    const encounter = await mutate(
      full,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters`
    )
      .send({ occurredAt: new Date().toISOString(), chiefComplaint: 'Suivi' })
      .expect(201);
    await mutate(
      full,
      'post',
      `/api/medical-records/patients/${patient.userId}/encounters/${encounter.body.id}/observations`
    )
      .send({
        category: 'SYMPTOM',
        label: 'Douleur',
        valueText: 'legere',
        observedAt: new Date().toISOString()
      })
      .expect(201);

    const bundle = (
      await limited.agent
        .get(`/api/fhir/patients/${patient.userId}/bundle`)
        .expect(200)
    ).body as FhirBundle;

    expect(validateFhirBundle(bundle)).toEqual([]);
    const types = resourceTypes(bundle);
    expect(types).toContain('Observation');
    // L'observation est exportee, mais la consultation qu'elle reference ne
    // l'est pas : la reference ne doit donc pas etre emise (sinon danger).
    expect(types).not.toContain('Encounter');

    const known = new Set(
      (bundle.entry ?? []).map(
        (entry) => `${entry.resource.resourceType}/${entry.resource.id}`
      )
    );
    collectReferences(bundle).forEach((reference) =>
      expect(known.has(reference)).toBe(true)
    );
    expect(validateFhirBundleAgainstSchema(bundle)).toEqual([]);
  });

  it('11. exposes documents only with VIEW_DOCUMENTS and never the storage key', async () => {
    const patient = await createUserAndSession('fhir_doc_patient');
    await patient.agent.get('/api/medical-records/me').expect(200);
    await upload(
      patient,
      '/api/medical-records/me/documents',
      { buffer: pdfBuffer(), filename: 'bilan.pdf', contentType: 'application/pdf' },
      { category: 'LAB_RESULT' }
    ).expect(201);

    const { session: noDocs, doctorProfileId: noDocsId } =
      await createVerifiedDoctor('fhir_doc_none');
    const { session: withDocs, doctorProfileId: withDocsId } =
      await createVerifiedDoctor('fhir_doc_yes');

    await mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({
        doctorProfileId: noDocsId,
        permissions: [
          RecordGrantPermission.VIEW_RECORD,
          RecordGrantPermission.VIEW_ENCOUNTERS,
          RecordGrantPermission.VIEW_OBSERVATIONS
        ],
        reason: 'Sans documents'
      })
      .expect(201);
    await mutate(patient, 'post', '/api/medical-records/me/grants')
      .send({
        doctorProfileId: withDocsId,
        permissions: [
          RecordGrantPermission.VIEW_RECORD,
          RecordGrantPermission.VIEW_DOCUMENTS
        ],
        reason: 'Avec documents'
      })
      .expect(201);

    const without = (
      await noDocs.agent
        .get(`/api/fhir/patients/${patient.userId}/bundle`)
        .expect(200)
    ).body as FhirBundle;
    expect(resourceTypes(without)).not.toContain('DocumentReference');

    const withDoc = (
      await withDocs.agent
        .get(`/api/fhir/patients/${patient.userId}/bundle`)
        .expect(200)
    ).body as FhirBundle;
    expect(resourceTypes(withDoc)).toContain('DocumentReference');
    expect(validateFhirBundle(withDoc)).toEqual([]);
    const serialized = JSON.stringify(withDoc);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('private-documents');
  });

  it('12. audits denied exports as access-denied events', async () => {
    const patient = await createUserAndSession('fhir_audit_patient');
    const { session: doctor, doctorProfileId } = await createVerifiedDoctor(
      'fhir_audit_doctor'
    );
    await patient.agent.get('/api/medical-records/me').expect(200);

    await doctor.agent
      .get(`/api/fhir/patients/${patient.userId}/bundle`)
      .expect(403);

    const event = await prisma.medicalRecordAccessEvent.findFirst({
      where: {
        medicalRecord: { patientUserId: patient.userId },
        action: MedicalRecordAccessAction.ACCESS_DENIED
      },
      orderBy: { createdAt: 'desc' }
    });
    expect(event).not.toBeNull();
    expect(event?.actorDoctorProfileId).toBe(doctorProfileId);
  });

  it('13. the demo bundle contains only synthetic identifiers', async () => {
    const user = await createUserAndSession('fhir_demo_synth');
    const bundle = (
      await user.agent.get('/api/fhir/demo/bundle').expect(200)
    ).body as FhirBundle;
    expect(bundle.id).toBe(DEMO_BUNDLE_ID);
    const ids = (bundle.entry ?? []).map((entry) => entry.resource.id);
    expect(ids).not.toContain(user.userId);
  });

  it('14. produces deterministic content for an identical authorization context', async () => {
    const patient = await createUserAndSession('fhir_det_patient');
    const first = (await patient.agent.get('/api/fhir/me/bundle').expect(200))
      .body as FhirBundle;
    const second = (await patient.agent.get('/api/fhir/me/bundle').expect(200))
      .body as FhirBundle;

    // `timestamp` est volontairement l'horodatage de l'export : on compare le
    // contenu clinique (ressources + ordre) hors cet horodatage.
    const stripTimestamp = (bundle: FhirBundle): FhirBundle => {
      const copy = JSON.parse(JSON.stringify(bundle)) as Record<string, unknown>;
      delete copy.timestamp;
      return copy as unknown as FhirBundle;
    };
    expect(stripTimestamp(first)).toEqual(stripTimestamp(second));
  });
});
