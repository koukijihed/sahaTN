// SahaTN - Données de démonstration.
// ATTENTION : toutes ces données sont FICTIVES (ADR-0007). Elles permettent de
// développer et de faire la démonstration sans aucune donnée réelle. Les
// référentiels devront provenir de sources institutionnelles vérifiées et être
// gérés par une procédure administrative contrôlée (voir docs/security.md).
//
// Le seed est IDEMPOTENT : le rejouer ne crée pas de doublons. Il est aussi
// DÉTERMINISTE pour tout ce qui touche aux identifiants de démonstration (les
// clés stables sont dérivées des adresses e-mail / noms, jamais de valeurs
// aléatoires relancées à chaque exécution).
import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

// --------------------------------------------------------------------------
// GARDE-FOU : ce seed ne doit s'executer QUE sur une base de DEMONSTRATION
// explicitement designee. Toutes les donnees sont fictives (ADR-0007), mais
// une execution accidentelle contre une base inconnue ou de production
// introduirait des comptes et donnees de demonstration la ou ils n'ont rien a
// faire. On adopte donc une politique « refuse par defaut, opt-in explicite ».
//
// Autorise uniquement si AU MOINS une de ces conditions est vraie :
//   - SAHATN_DEMO_SEED = 1 (ou true)           -> opt-in explicite (Render,
//                                                  execution manuelle controlee,
//                                                  script `npm run db:seed`).
//   - NODE_ENV = test                          -> harnais e2e/navigateur
//                                                  (base ephemere jetable).
// Sinon le seed s'arrete immediatement (code de sortie != 0) sans rien ecrire.
// Cela protege notamment NODE_ENV=production : meme avec DATABASE_URL renseigne,
// aucun seed ne se declenche sans SAHATN_DEMO_SEED=1.
// --------------------------------------------------------------------------
function isDemoSeedAuthorized() {
  const optIn = (process.env.SAHATN_DEMO_SEED || '').trim().toLowerCase();
  if (optIn === '1' || optIn === 'true' || optIn === 'yes') {
    return true;
  }
  return process.env.NODE_ENV === 'test';
}

if (!isDemoSeedAuthorized()) {
  console.error(
    '[seed] Refus : le seed de demonstration ne s\'execute que sur une base ' +
      'synthetique explicitement designee. Definir SAHATN_DEMO_SEED=1 pour ' +
      'autoriser (ou NODE_ENV=test dans le harnais de tests). Aucune donnee ' +
      "n'a ete ecrite."
  );
  process.exit(1);
}

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'DemoPassw0rd!2024';

// --------------------------------------------------------------------------
// Stockage privé des documents de démonstration.
//
// Le contenu binaire n'est JAMAIS stocké en base (métadonnées seules, voir
// schema.prisma). On reproduit ici, sans dépendre du conteneur NestJS, le
// contrat du stockage local : clé générée par le serveur, contenu écrit hors
// répertoire public, empreinte SHA-256 pour l'intégrité. Le type MIME détecté
// est vérifié par lecture des octets d'en-tête (magic bytes), comme le fait le
// service réel.
// --------------------------------------------------------------------------

const DOCUMENT_STORAGE_ROOT = resolve(
  process.env.DOCUMENT_STORAGE_DIR?.trim() ||
    join(process.cwd(), 'storage', 'private-documents')
);

function resolveStorageKey(key) {
  if (!key || key.includes('\0') || isAbsolute(key)) {
    throw new Error('Invalid document storage key');
  }
  const candidate = resolve(DOCUMENT_STORAGE_ROOT, key);
  const rel = relative(DOCUMENT_STORAGE_ROOT, candidate);
  if (rel.length === 0 || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('Invalid document storage key');
  }
  return candidate;
}

async function saveDocumentContent(key, content) {
  const target = resolveStorageKey(key);
  await mkdir(dirname(target), { recursive: true });
  // flag "wx" : refuse d'écraser un contenu existant (clé censée unique).
  await writeFile(target, content, { mode: 0o600, flag: 'wx' });
}

// En-tête PNG minimal (signature + IHDR valide) suivi de données fictives.
// Suffisant pour que la détection par magic bytes reconnaisse image/png.
function syntheticPng(seedText) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.from([
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // length + "IHDR"
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89
  ]);
  return Buffer.concat([signature, ihdr, Buffer.from(seedText, 'utf8')]);
}

function sha256Hex(content) {
  return createHash('sha256').update(content).digest('hex');
}

function detectMimeType(content) {
  if (
    content.length >= 8 &&
    content[0] === 0x89 &&
    content[1] === 0x50 &&
    content[2] === 0x4e &&
    content[3] === 0x47
  ) {
    return 'image/png';
  }
  return null;
}

// Crée (ou retrouve) un document de démonstration. La clé de stockage est
// dérivée d'un libellé stable pour rester idempotente entre deux exécutions.
async function upsertDemoDocument({
  medicalRecordId,
  encounterId,
  category,
  originalName,
  seedText,
  uploadedByUserId,
  uploaderDoctorProfileId
}) {
  const content = syntheticPng(seedText);
  const detectedMimeType = detectMimeType(content);
  if (!detectedMimeType) {
    throw new Error(`Synthetic document ${originalName} has no detectable type`);
  }
  const checksumSha256 = sha256Hex(content);
  const storageKey = `documents/demo/${createHash('sha256')
    .update(originalName)
    .digest('hex')
    .slice(0, 32)}`;

  const existing = await prisma.medicalDocument.findFirst({
    where: { medicalRecordId, originalName }
  });
  if (existing) {
    return existing;
  }

  // Écrit le contenu hors base (hors répertoire public). Si l'écriture échoue
  // (contenu déjà présent sous la même clé), on tolère : la clé est stable.
  await saveDocumentContent(storageKey, content).catch((error) => {
    if (error && error.code !== 'EEXIST') {
      throw error;
    }
  });

  return prisma.medicalDocument.create({
    data: {
      medicalRecordId,
      encounterId: encounterId ?? null,
      category,
      originalName,
      storageKey,
      declaredMimeType: detectedMimeType,
      detectedMimeType,
      sizeBytes: content.length,
      checksumSha256,
      uploadedByUserId,
      uploaderDoctorProfileId: uploaderDoctorProfileId ?? null
    }
  });
}

// --------------------------------------------------------------------------
// Référentiels
// --------------------------------------------------------------------------

const specialties = [
  { code: 'GENERAL_MEDICINE', labelFr: 'Medecine generale', labelAr: 'الطب العام' },
  { code: 'CARDIOLOGY', labelFr: 'Cardiologie', labelAr: 'أمراض القلب' },
  { code: 'DERMATOLOGY', labelFr: 'Dermatologie', labelAr: 'الأمراض الجلدية' },
  { code: 'PEDIATRICS', labelFr: 'Pediatrie', labelAr: 'طب الأطفال' },
  { code: 'GYNECOLOGY', labelFr: 'Gynecologie-obstetrique', labelAr: 'أمراض النساء والتوليد' },
  { code: 'ORTHOPEDICS', labelFr: 'Orthopedie-traumatologie', labelAr: 'جراحة العظام' },
  { code: 'OPHTHALMOLOGY', labelFr: 'Ophtalmologie', labelAr: 'طب العيون' },
  { code: 'PSYCHIATRY', labelFr: 'Psychiatrie', labelAr: 'الطب النفسي' },
  { code: 'NEUROLOGY', labelFr: 'Neurologie', labelAr: 'طب الأعصاب' },
  { code: 'ENT', labelFr: 'Oto-rhino-laryngologie', labelAr: 'أنف وأذن وحنجرة' },
  { code: 'RADIOLOGY', labelFr: 'Radiologie', labelAr: 'الأشعة' },
  { code: 'FAMILY_MEDICINE', labelFr: 'Medecine de famille', labelAr: 'طب الأسرة' },
  // Specialites ci-dessous : intitules releves sur la liste du residanat publiee
  // par le CNOM (https://www.ordre-medecins.org.tn/etudes-medicales/).
  // Les libelles arabes sont des traductions usuelles a faire valider par un
  // referentiel officiel avant toute mise en production.
  { code: 'INTERNAL_MEDICINE', labelFr: 'Médecine interne', labelAr: 'الطب الباطني' },
  { code: 'INFECTIOUS_DISEASES', labelFr: 'Maladies infectieuses', labelAr: 'الأمراض المعدية' },
  { code: 'ENDOCRINOLOGY', labelFr: 'Endocrinologie', labelAr: 'أمراض الغدد الصماء' },
  { code: 'NEPHROLOGY', labelFr: 'Néphrologie', labelAr: 'أمراض الكلى' },
  { code: 'PULMONOLOGY', labelFr: 'Pneumologie', labelAr: 'أمراض الرئة' },
  { code: 'RHEUMATOLOGY', labelFr: 'Rhumatologie', labelAr: 'أمراض الروماتيزم' },
  { code: 'GASTROENTEROLOGY', labelFr: 'Gastro-entérologie', labelAr: 'أمراض الجهاز الهضمي' },
  { code: 'HEMATOLOGY', labelFr: 'Hématologie clinique', labelAr: 'أمراض الدم' },
  { code: 'MEDICAL_ONCOLOGY', labelFr: 'Carcinologie médicale', labelAr: 'طب الأورام' },
  { code: 'CHILD_PSYCHIATRY', labelFr: 'Pédopsychiatrie', labelAr: 'الطب النفسي للأطفال' },
  { code: 'PHYSICAL_MEDICINE', labelFr: 'Médecine physique et rééducation fonctionnelle', labelAr: 'الطب الفيزيائي وإعادة التأهيل' },
  { code: 'OCCUPATIONAL_MEDICINE', labelFr: 'Médecine du travail', labelAr: 'طب الشغل' },
  { code: 'FORENSIC_MEDICINE', labelFr: 'Médecine légale', labelAr: 'الطب الشرعي' },
  { code: 'ANESTHESIA_RESUSCITATION', labelFr: 'Anesthésie-réanimation', labelAr: 'التخدير والإنعاش' },
  { code: 'PATHOLOGY', labelFr: 'Anatomie et cytologie pathologiques', labelAr: 'التشريح والخلايا المرضية' },
  { code: 'GENERAL_SURGERY', labelFr: 'Chirurgie générale', labelAr: 'الجراحة العامة' },
  { code: 'THORACIC_SURGERY', labelFr: 'Chirurgie thoracique', labelAr: 'جراحة الصدر' },
  { code: 'VASCULAR_SURGERY', labelFr: 'Chirurgie vasculaire périphérique', labelAr: 'جراحة الأوعية الدموية' },
  { code: 'CARDIOVASCULAR_SURGERY', labelFr: 'Chirurgie cardio-vasculaire', labelAr: 'جراحة القلب والشرايين' },
  { code: 'NEUROSURGERY', labelFr: 'Neurochirurgie', labelAr: 'جراحة الأعصاب' },
  { code: 'UROLOGY', labelFr: 'Urologie', labelAr: 'جراحة المسالك البولية' },
  { code: 'PLASTIC_SURGERY', labelFr: 'Chirurgie plastique, réparatrice et esthétique', labelAr: 'الجراحة التجميلية والترميمية' },
  { code: 'PEDIATRIC_SURGERY', labelFr: 'Chirurgie pédiatrique', labelAr: 'جراحة الأطفال' },
  { code: 'MAXILLOFACIAL_SURGERY', labelFr: 'Stomatologie et chirurgie maxillo-faciale', labelAr: 'جراحة الفم والوجه والفكين' }
];

const facilities = [
  {
    displayName: 'Hôpital universitaire Jabal Al-Fikr',
    officialName: 'Hôpital universitaire Jabal Al-Fikr',
    sector: 'PUBLIC',
    type: 'UNIVERSITY_HOSPITAL',
    governorate: 'TUNIS',
    city: 'Le Bardo',
    delegation: 'Le Bardo',
    postalCode: '2000',
    addressLine: 'Avenue des Sciences, 2000 Le Bardo',
    phone: '+216 71 00 01 01',
    websiteUrl: null,
    description: 'Établissement public hospitalo-universitaire fictif.'
  },
  {
    displayName: 'Hôpital régional Ksar El Bârid',
    officialName: 'Hôpital régional Ksar El Bârid',
    sector: 'PUBLIC',
    type: 'REGIONAL_HOSPITAL',
    governorate: 'BEN_AROUS',
    city: 'Ksar El Bârid',
    delegation: 'Ksar El Bârid',
    postalCode: '2051',
    addressLine: 'Rue de la République, 2051 Ksar El Bârid',
    phone: '+216 79 00 02 02',
    websiteUrl: null,
    description: 'Établissement public régional fictif.'
  },
  {
    displayName: 'Hôpital local Bir El Hechmi',
    officialName: 'Hôpital local Bir El Hechmi',
    sector: 'PUBLIC',
    type: 'LOCAL_HOSPITAL',
    governorate: 'KAIROUAN',
    city: 'Bir El Hechmi',
    delegation: 'Bir El Hechmi',
    postalCode: '3151',
    addressLine: 'Avenue de la Santé, 3151 Bir El Hechmi',
    phone: '+216 77 00 03 03',
    websiteUrl: null,
    description: 'Établissement public local fictif.'
  },
  {
    displayName: 'Centre de santé de base Oued El Ferch',
    officialName: 'Centre de santé de base Oued El Ferch',
    sector: 'PUBLIC',
    type: 'BASIC_HEALTH_CENTER',
    governorate: 'SILIANA',
    city: 'Oued El Ferch',
    delegation: 'Oued El Ferch',
    postalCode: '6115',
    addressLine: 'Rue des Oliviers, 6115 Oued El Ferch',
    phone: '+216 72 00 04 04',
    websiteUrl: null,
    description: 'Centre de santé de base fictif.'
  },
  {
    displayName: 'Polyclinique Les Palmiers',
    officialName: 'Polyclinique Les Palmiers',
    sector: 'PRIVATE',
    type: 'PRIVATE_CLINIC',
    governorate: 'SFAX',
    city: 'Sfax',
    delegation: 'Sfax Ville',
    postalCode: '3000',
    addressLine: 'Avenue Habib Thameur, 3000 Sfax',
    phone: '+216 74 00 05 05',
    websiteUrl: 'https://palmiers.example.tn',
    description: 'Clinique privée fictive.'
  },
  {
    displayName: 'Clinique Odyssée',
    officialName: 'Clinique Odyssée',
    sector: 'PRIVATE',
    type: 'PRIVATE_CLINIC',
    governorate: 'NABEUL',
    city: 'Hammamet',
    delegation: 'Hammamet',
    postalCode: '8050',
    addressLine: 'Avenue de la Méditerranée, 8050 Hammamet',
    phone: '+216 72 00 06 06',
    websiteUrl: null,
    description: 'Clinique privée fictive.'
  },
  {
    displayName: 'Cabinet médical Dr Amina Boudali',
    officialName: 'Cabinet médical Dr Amina Boudali',
    sector: 'PRIVATE',
    type: 'MEDICAL_CABINET',
    governorate: 'SOUSSE',
    city: 'Sousse',
    delegation: 'Sousse Ville',
    postalCode: '4000',
    addressLine: 'Rue du Littoral, 4000 Sousse',
    phone: '+216 73 00 07 07',
    websiteUrl: null,
    description: 'Cabinet médical fictif.'
  },
  {
    displayName: "Laboratoire d'analyses Atlas",
    officialName: "Laboratoire d'analyses Atlas",
    sector: 'PRIVATE',
    type: 'ANALYSIS_LABORATORY',
    governorate: 'MONASTIR',
    city: 'Monastir',
    delegation: 'Monastir Ville',
    postalCode: '5000',
    addressLine: 'Avenue de la Liberté, 5000 Monastir',
    phone: '+216 73 00 08 08',
    websiteUrl: null,
    description: 'Laboratoire d’analyses médicales fictif.'
  },
  {
    displayName: "Centre d'imagerie Panorama",
    officialName: "Centre d'imagerie Panorama",
    sector: 'PRIVATE',
    type: 'IMAGING_CENTER',
    governorate: 'ARIANA',
    city: 'La Manouba',
    delegation: 'La Manouba',
    postalCode: '2010',
    addressLine: 'Rue du Panorama, 2010 La Manouba',
    phone: '+216 70 00 09 09',
    websiteUrl: null,
    description: 'Centre d’imagerie médicale fictif.'
  },
  // Couverture des 15 autres gouvernorats. Seuls le gouvernorat et son chef-lieu
  // (homonyme) sont des faits geographiques ; noms, telephones et adresses sont
  // FICTIFS (ADR-0007). Code postal et delegation volontairement omis : non verifies.
  ...[
    ['MANOUBA', 'La Manouba', 'PUBLIC', 'LOCAL_HOSPITAL', 'Hôpital local Les Jasmins', '+216 70 00 10 10'],
    ['ZAGHOUAN', 'Zaghouan', 'PUBLIC', 'BASIC_HEALTH_CENTER', 'Centre de santé de base Les Figuiers', '+216 72 00 11 11'],
    ['BIZERTE', 'Bizerte', 'PUBLIC', 'REGIONAL_HOSPITAL', 'Hôpital régional Les Mouettes', '+216 72 00 12 12'],
    ['BEJA', 'Béja', 'PUBLIC', 'REGIONAL_HOSPITAL', 'Hôpital régional Les Blés', '+216 78 00 13 13'],
    ['JENDOUBA', 'Jendouba', 'PUBLIC', 'LOCAL_HOSPITAL', 'Hôpital local Les Chênes-lièges', '+216 78 00 14 14'],
    ['KEF', 'Le Kef', 'PUBLIC', 'REGIONAL_HOSPITAL', 'Hôpital régional Les Remparts', '+216 78 00 15 15'],
    ['MAHDIA', 'Mahdia', 'PRIVATE', 'PRIVATE_CLINIC', 'Clinique Les Dunes', '+216 73 00 16 16'],
    ['KASSERINE', 'Kasserine', 'PUBLIC', 'REGIONAL_HOSPITAL', 'Hôpital régional Les Cimes', '+216 77 00 17 17'],
    ['SIDI_BOUZID', 'Sidi Bouzid', 'PUBLIC', 'LOCAL_HOSPITAL', 'Hôpital local Les Amandiers', '+216 76 00 18 18'],
    ['GABES', 'Gabès', 'PRIVATE', 'MEDICAL_GROUP', 'Groupe médical L’Oasis', '+216 75 00 19 19'],
    ['MEDENINE', 'Médenine', 'PUBLIC', 'REGIONAL_HOSPITAL', 'Hôpital régional Les Ksour', '+216 75 00 20 20'],
    ['TATAOUINE', 'Tataouine', 'PUBLIC', 'BASIC_HEALTH_CENTER', 'Centre de santé de base Le Désert', '+216 75 00 21 21'],
    ['GAFSA', 'Gafsa', 'PRIVATE', 'ANALYSIS_LABORATORY', 'Laboratoire d’analyses Les Mines', '+216 76 00 22 22'],
    ['TOZEUR', 'Tozeur', 'PRIVATE', 'MEDICAL_CABINET', 'Cabinet médical Les Palmeraies', '+216 76 00 23 23'],
    ['KEBILI', 'Kébili', 'PUBLIC', 'LOCAL_HOSPITAL', 'Hôpital local Les Dattiers', '+216 75 00 24 24']
  ].map(([governorate, city, sector, type, displayName, phone]) => ({
    displayName,
    officialName: displayName,
    sector,
    type,
    governorate,
    city,
    delegation: null,
    postalCode: null,
    addressLine: `Adresse fictive, ${city}`,
    phone,
    websiteUrl: null,
    description: 'Établissement fictif de démonstration (aucune donnée réelle).'
  }))
];

// --------------------------------------------------------------------------
// Helpers d'idempotence
// --------------------------------------------------------------------------

async function upsertSpecialties() {
  for (const specialty of specialties) {
    await prisma.specialty.upsert({
      where: { code: specialty.code },
      update: { labelFr: specialty.labelFr, labelAr: specialty.labelAr },
      create: specialty
    });
  }
  return specialties.length;
}

async function upsertUser({ email, phone }) {
  const passwordHash = await hash(DEMO_PASSWORD, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1
  });
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, phone, passwordHash }
  });
}

async function grantRole(userId, role) {
  await prisma.userRole.upsert({
    where: { userId_role: { userId, role } },
    update: {},
    create: { userId, role }
  });
}

async function seedFacilities() {
  const created = [];
  for (const data of facilities) {
    const existing = await prisma.healthcareFacility.findFirst({
      where: { displayName: data.displayName }
    });
    if (existing) {
      created.push(existing);
      continue;
    }
    const facility = await prisma.healthcareFacility.create({
      data: {
        ...data,
        verificationStatus: 'VERIFIED',
        isPubliclyListed: true,
        lastVerifiedAt: new Date()
      }
    });
    await prisma.facilityVerificationEvent.create({
      data: {
        facilityId: facility.id,
        action: 'APPROVED',
        fromStatus: 'PENDING',
        toStatus: 'VERIFIED',
        reason: 'Vérification de démonstration (données fictives).'
      }
    });
    created.push(facility);
  }
  return created;
}

async function upsertDoctor({
  email,
  phone,
  displayName,
  description,
  specialtyCodes,
  verificationStatus,
  isPubliclyListed,
  facilityName,
  withCredential
}) {
  const user = await upsertUser({ email, phone });
  await grantRole(user.id, 'DOCTOR');

  const profile = await prisma.doctorProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      displayName,
      professionalDescription: description,
      languages: ['fr', 'ar'],
      yearsOfExperience: 12,
      verificationStatus,
      isPubliclyListed
    }
  });

  for (const [code, isPrimary] of specialtyCodes) {
    const specialty = await prisma.specialty.findUnique({ where: { code } });
    if (!specialty) {
      continue;
    }
    await prisma.doctorSpecialty.upsert({
      where: {
        doctorProfileId_specialtyId: {
          doctorProfileId: profile.id,
          specialtyId: specialty.id
        }
      },
      update: { isPrimary },
      create: { doctorProfileId: profile.id, specialtyId: specialty.id, isPrimary }
    });
  }

  const existingCredentials = await prisma.professionalCredential.count({
    where: { doctorProfileId: profile.id }
  });
  if (existingCredentials === 0) {
    await prisma.professionalCredential.create({
      data: {
        doctorProfileId: profile.id,
        type: 'DIPLOMA',
        issuingBody: 'Faculté de médecine (fictive) de Tunis',
        reference: `DEMO-DIPLOME-${email.split('@')[0].toUpperCase()}`,
        verificationStatus: withCredential ? 'VERIFIED' : 'UNVERIFIED',
        verifiedAt: withCredential ? new Date() : null
      }
    });
  }

  let affiliation = null;
  if (facilityName) {
    const facility = await prisma.healthcareFacility.findFirst({
      where: { displayName: facilityName }
    });
    if (facility) {
      affiliation = await prisma.doctorFacilityAffiliation.findFirst({
        where: {
          doctorProfileId: profile.id,
          facilityId: facility.id,
          status: 'VERIFIED'
        }
      });
      if (!affiliation) {
        affiliation = await prisma.doctorFacilityAffiliation.create({
          data: {
            doctorProfileId: profile.id,
            facilityId: facility.id,
            status: 'VERIFIED',
            requestedBy: user.id,
            decidedBy: user.id,
            decidedAt: new Date()
          }
        });
      }
    }
  }

  return { user, profile, affiliation };
}

async function ensureSchedule(affiliation, confirmationMode) {
  if (!affiliation) {
    return null;
  }
  return prisma.appointmentSchedule.upsert({
    where: { affiliationId: affiliation.id },
    update: {},
    create: {
      affiliationId: affiliation.id,
      timezone: 'Africa/Tunis',
      visitDurationMinutes: 30,
      confirmationMode
    }
  });
}

// Crée un créneau et son rendez-vous de démonstration. La clé d'idempotence du
// rendez-vous est fixe (par patient) : rejouer le seed ne duplique rien.
async function createDemoAppointment({
  schedule,
  patientUserId,
  startsAt,
  status,
  reason,
  idempotencyKey
}) {
  if (!schedule) {
    return null;
  }
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const slot = await prisma.appointmentSlot.upsert({
    where: { scheduleId_startsAt: { scheduleId: schedule.id, startsAt } },
    update: {},
    create: {
      scheduleId: schedule.id,
      startsAt,
      endsAt,
      // Un rendez-vous annulé libère le créneau ; les autres le consomment.
      status: status === 'CANCELLED' ? 'OPEN' : 'BOOKED'
    }
  });

  const existing = await prisma.appointment.findUnique({
    where: {
      patientUserId_idempotencyKey: { patientUserId, idempotencyKey }
    }
  });
  if (existing) {
    return existing;
  }

  const requiresConfirmation = schedule.confirmationMode === 'MANUAL';
  const appointment = await prisma.appointment.create({
    data: {
      slotId: slot.id,
      patientUserId,
      reason: reason ?? null,
      requiresConfirmation,
      status,
      idempotencyKey
    }
  });

  const events = [
    { action: 'CREATED', fromStatus: null, toStatus: status === 'PENDING' ? 'PENDING' : status }
  ];
  if (status === 'CONFIRMED') {
    events.push({ action: 'CONFIRMED', fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
  } else if (status === 'COMPLETED') {
    events.push({ action: 'CONFIRMED', fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    events.push({ action: 'COMPLETED', fromStatus: 'CONFIRMED', toStatus: 'COMPLETED' });
  } else if (status === 'CANCELLED') {
    events.push({ action: 'CANCELLED', fromStatus: 'PENDING', toStatus: 'CANCELLED' });
  } else if (status === 'NO_SHOW') {
    events.push({ action: 'CONFIRMED', fromStatus: 'PENDING', toStatus: 'CONFIRMED' });
    events.push({ action: 'NO_SHOW_MARKED', fromStatus: 'CONFIRMED', toStatus: 'NO_SHOW' });
  }

  for (const event of events) {
    await prisma.appointmentEvent.create({
      data: {
        appointmentId: appointment.id,
        actorId: patientUserId,
        action: event.action,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus
      }
    });
  }

  return appointment;
}

async function enqueueNotification({
  type,
  recipientUserId,
  dedupeKey,
  appointmentId,
  payload
}) {
  await prisma.notificationOutbox.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      type,
      recipientUserId,
      appointmentId: appointmentId ?? null,
      payload,
      dedupeKey
    }
  });
}

// --------------------------------------------------------------------------
// Dossier médical de démonstration
// --------------------------------------------------------------------------

const ALL_READ_WRITE_PERMISSIONS = [
  'VIEW_RECORD',
  'VIEW_ENCOUNTERS',
  'VIEW_OBSERVATIONS',
  'VIEW_DIAGNOSES',
  'VIEW_ALLERGIES',
  'VIEW_DOCUMENTS',
  'WRITE_ENCOUNTERS',
  'WRITE_OBSERVATIONS',
  'WRITE_DIAGNOSES',
  'WRITE_ALLERGIES',
  'WRITE_DOCUMENTS'
];

async function ensureMedicalRecord(patientUserId) {
  const existing = await prisma.medicalRecord.findUnique({
    where: { patientUserId }
  });
  if (existing) {
    return existing;
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.medicalRecord.create({ data: { patientUserId } });
    await tx.medicalRecordAccessEvent.create({
      data: {
        medicalRecordId: created.id,
        actorUserId: patientUserId,
        action: 'RECORD_CREATED',
        purpose: 'PATIENT_SELF'
      }
    });
    return created;
  });
}

async function ensureGrant({
  medicalRecordId,
  doctorProfileId,
  permissions,
  reason,
  grantedByUserId
}) {
  const existing = await prisma.medicalRecordGrant.findFirst({
    where: { medicalRecordId, granteeDoctorProfileId: doctorProfileId, status: 'ACTIVE' }
  });
  if (existing) {
    return existing;
  }
  return prisma.$transaction(async (tx) => {
    const grant = await tx.medicalRecordGrant.create({
      data: {
        medicalRecordId,
        granteeDoctorProfileId: doctorProfileId,
        permissions,
        effectiveAt: new Date(),
        reason: reason ?? null,
        grantedByUserId
      }
    });
    await tx.medicalRecordGrantEvent.create({
      data: {
        grantId: grant.id,
        action: 'GRANTED',
        actorUserId: grantedByUserId,
        reason: reason ?? null
      }
    });
    await tx.medicalRecordAccessEvent.create({
      data: {
        medicalRecordId,
        actorUserId: grantedByUserId,
        action: 'GRANT_CREATED',
        purpose: 'PATIENT_SELF',
        targetType: 'MedicalRecordGrant',
        targetId: grant.id
      }
    });
    return grant;
  });
}

async function ensureCareRelationship({
  patientUserId,
  doctorProfileId,
  source
}) {
  const existing = await prisma.careRelationship.findFirst({
    where: { patientUserId, doctorProfileId, status: 'ACTIVE' }
  });
  if (existing) {
    return existing;
  }
  return prisma.careRelationship.create({
    data: { patientUserId, doctorProfileId, source }
  });
}

async function ensureEncounter({
  medicalRecordId,
  doctorProfileId,
  facilityId,
  appointmentId,
  type,
  occurredAt,
  chiefComplaint,
  notes
}) {
  if (appointmentId) {
    const existing = await prisma.clinicalEncounter.findUnique({
      where: { appointmentId }
    });
    if (existing) {
      return existing;
    }
  }
  const duplicate = await prisma.clinicalEncounter.findFirst({
    where: {
      medicalRecordId,
      doctorProfileId,
      occurredAt,
      chiefComplaint: chiefComplaint ?? null
    }
  });
  if (duplicate) {
    return duplicate;
  }
  return prisma.$transaction(async (tx) => {
    const created = await tx.clinicalEncounter.create({
      data: {
        medicalRecordId,
        doctorProfileId,
        facilityId: facilityId ?? null,
        appointmentId: appointmentId ?? null,
        type,
        occurredAt,
        chiefComplaint: chiefComplaint ?? null,
        notes: notes ?? null
      }
    });
    await tx.medicalRecordAccessEvent.create({
      data: {
        medicalRecordId,
        actorUserId: null,
        actorDoctorProfileId: doctorProfileId,
        action: 'ENCOUNTER_CREATED',
        purpose: 'EXPLICIT_GRANT',
        targetType: 'ClinicalEncounter',
        targetId: created.id
      }
    });
    return created;
  });
}

async function ensureObservation({
  medicalRecordId,
  encounterId,
  doctorProfileId,
  category,
  code,
  label,
  valueText,
  valueNumeric,
  unit,
  certainty,
  observedAt
}) {
  const existing = await prisma.clinicalObservation.findFirst({
    where: { medicalRecordId, doctorProfileId, label, observedAt }
  });
  if (existing) {
    return existing;
  }
  return prisma.clinicalObservation.create({
    data: {
      medicalRecordId,
      encounterId: encounterId ?? null,
      doctorProfileId,
      category,
      code: code ?? null,
      label,
      valueText: valueText ?? null,
      valueNumeric: valueNumeric ?? null,
      unit: unit ?? null,
      certainty: certainty ?? 'KNOWN',
      observedAt
    }
  });
}

async function ensureDiagnosis({
  medicalRecordId,
  encounterId,
  doctorProfileId,
  code,
  label,
  description,
  status,
  diagnosedAt
}) {
  const existing = await prisma.clinicalDiagnosis.findFirst({
    where: { medicalRecordId, doctorProfileId, label, diagnosedAt }
  });
  if (existing) {
    return existing;
  }
  return prisma.clinicalDiagnosis.create({
    data: {
      medicalRecordId,
      encounterId: encounterId ?? null,
      doctorProfileId,
      code: code ?? null,
      label,
      description: description ?? null,
      status: status ?? 'PROVISIONAL',
      diagnosedAt
    }
  });
}

async function ensureAllergy({
  medicalRecordId,
  doctorProfileId,
  allergen,
  reaction,
  severity,
  source,
  certainty,
  status,
  recordedAt
}) {
  const existing = await prisma.patientAllergy.findFirst({
    where: { medicalRecordId, allergen, recordedAt }
  });
  if (existing) {
    return existing;
  }
  return prisma.patientAllergy.create({
    data: {
      medicalRecordId,
      doctorProfileId,
      allergen,
      reaction: reaction ?? null,
      severity: severity ?? null,
      source: source ?? 'PROFESSIONAL_DOCUMENTED',
      certainty: certainty ?? 'KNOWN',
      status: status ?? 'ACTIVE',
      recordedAt
    }
  });
}

// --------------------------------------------------------------------------
// Orchestration
// --------------------------------------------------------------------------

async function seedDemoStaff() {
  const user = await upsertUser({
    email: 'demo.staff@sahatn.example',
    phone: '+21620000002'
  });
  await grantRole(user.id, 'FACILITY_STAFF');

  const hospital = await prisma.healthcareFacility.findFirst({
    where: { displayName: 'Hôpital universitaire Jabal Al-Fikr' }
  });
  if (hospital) {
    const existing = await prisma.facilityManager.findFirst({
      where: { facilityId: hospital.id, userId: user.id }
    });
    if (!existing) {
      await prisma.facilityManager.create({
        data: { facilityId: hospital.id, userId: user.id }
      });
    }
  }
  return user;
}

async function main() {
  const specialtyCount = await upsertSpecialties();
  const facilitiesById = await seedFacilities();

  // --- Praticiens ---------------------------------------------------------
  const primaryDoctor = await upsertDoctor({
    email: 'demo.doctor@sahatn.example',
    phone: '+21620000001',
    displayName: 'Dr Mounir Trabelsi',
    description: 'Médecin généraliste de démonstration.',
    specialtyCodes: [
      ['GENERAL_MEDICINE', true],
      ['CARDIOLOGY', false]
    ],
    verificationStatus: 'VERIFIED',
    isPubliclyListed: true,
    facilityName: 'Polyclinique Les Palmiers',
    withCredential: true
  });

  const secondaryDoctor = await upsertDoctor({
    email: 'demo.doctor2@sahatn.example',
    phone: '+21620000003',
    displayName: 'Dr Salma Ben Youssef',
    description: 'Cardiologue de démonstration (profil en attente de vérification).',
    specialtyCodes: [['CARDIOLOGY', true]],
    verificationStatus: 'PENDING',
    isPubliclyListed: false,
    facilityName: 'Hôpital universitaire Jabal Al-Fikr',
    withCredential: false
  });

  await seedDemoStaff();

  // --- Patients -----------------------------------------------------------
  const primaryPatient = await upsertUser({
    email: 'demo.patient@sahatn.example',
    phone: '+21620000010'
  });
  await grantRole(primaryPatient.id, 'PATIENT');

  const secondaryPatient = await upsertUser({
    email: 'demo.patient2@sahatn.example',
    phone: '+21620000011'
  });
  await grantRole(secondaryPatient.id, 'PATIENT');

  // --- Documents (stockage privé + SHA-256) --------------------------------
  const primaryRecord = await ensureMedicalRecord(primaryPatient.id);
  const secondaryRecord = await ensureMedicalRecord(secondaryPatient.id);

  const doctorAffiliation = primaryDoctor.affiliation;
  const facilityId = doctorAffiliation?.facilityId ?? null;

  const schedule = await ensureSchedule(doctorAffiliation, 'MANUAL');

  // --- Rendez-vous en états variés ----------------------------------------
  // Ancre temporelle FIXE : indispensable pour que le seed reste idempotent.
  // Des dates relatives à `Date.now()` créeraient de nouveaux créneaux et de
  // nouvelles entrées cliniques à chaque exécution.
  const now = new Date('2025-06-01T09:00:00.000Z');
  const day = 24 * 60 * 60 * 1000;

  const completedAppointment = await createDemoAppointment({
    schedule,
    patientUserId: primaryPatient.id,
    startsAt: new Date(now.getTime() - 10 * day),
    status: 'COMPLETED',
    reason: 'Suivi de tension artérielle.',
    idempotencyKey: 'demo-appointment-completed'
  });
  await enqueueNotification({
    type: 'APPOINTMENT_COMPLETED',
    recipientUserId: primaryPatient.id,
    dedupeKey: 'demo-notif-appointment-completed',
    appointmentId: completedAppointment?.id,
    payload: { appointmentId: completedAppointment?.id ?? null }
  });

  const confirmedAppointment = await createDemoAppointment({
    schedule,
    patientUserId: primaryPatient.id,
    startsAt: new Date(now.getTime() + 5 * day),
    status: 'CONFIRMED',
    reason: 'Consultation de contrôle.',
    idempotencyKey: 'demo-appointment-confirmed'
  });
  await enqueueNotification({
    type: 'APPOINTMENT_CONFIRMED',
    recipientUserId: primaryPatient.id,
    dedupeKey: 'demo-notif-appointment-confirmed',
    appointmentId: confirmedAppointment?.id,
    payload: { appointmentId: confirmedAppointment?.id ?? null }
  });

  await createDemoAppointment({
    schedule,
    patientUserId: primaryPatient.id,
    startsAt: new Date(now.getTime() + 12 * day),
    status: 'PENDING',
    reason: 'Nouvelle consultation.',
    idempotencyKey: 'demo-appointment-pending'
  });

  await createDemoAppointment({
    schedule,
    patientUserId: secondaryPatient.id,
    startsAt: new Date(now.getTime() - 3 * day),
    status: 'CANCELLED',
    reason: 'Rendez-vous annulé par le patient.',
    idempotencyKey: 'demo-appointment-cancelled'
  });

  await createDemoAppointment({
    schedule,
    patientUserId: secondaryPatient.id,
    startsAt: new Date(now.getTime() - 20 * day),
    status: 'NO_SHOW',
    reason: 'Patient absent.',
    idempotencyKey: 'demo-appointment-noshow'
  });

  // --- Consentement (autorisation) ----------------------------------------
  // Le patient principal consent un accès complet au praticien vérifié.
  await ensureGrant({
    medicalRecordId: primaryRecord.id,
    doctorProfileId: primaryDoctor.profile.id,
    permissions: ALL_READ_WRITE_PERMISSIONS,
    reason: 'Consentement de démonstration (accès complet).',
    grantedByUserId: primaryPatient.id
  });
  await ensureCareRelationship({
    patientUserId: primaryPatient.id,
    doctorProfileId: primaryDoctor.profile.id,
    source: 'PATIENT_GRANT'
  });

  // Le médecin non vérifié (PENDING) ne reçoit AUCUN consentement : il ne doit
  // jamais accéder à un dossier. Le second patient n'a accordé aucun accès :
  // le praticien ne peut pas le voir (démonstration du cloisonnement).

  // --- Dossier clinique du patient principal ------------------------------
  const encounter1 = await ensureEncounter({
    medicalRecordId: primaryRecord.id,
    doctorProfileId: primaryDoctor.profile.id,
    facilityId,
    appointmentId: completedAppointment?.id,
    type: 'CONSULTATION',
    occurredAt: new Date(now.getTime() - 10 * day),
    chiefComplaint: 'Céphalées occasionnelles et fatigue.',
    notes: 'Examen clinique sans anomalie majeure. Réévaluation conseillée.'
  });

  await ensureObservation({
    medicalRecordId: primaryRecord.id,
    encounterId: encounter1.id,
    doctorProfileId: primaryDoctor.profile.id,
    category: 'VITAL_SIGN',
    code: 'SYSTOLIC_BP',
    label: 'Tension artérielle systolique',
    valueNumeric: 128,
    unit: 'mmHg',
    observedAt: new Date(now.getTime() - 10 * day)
  });
  await ensureObservation({
    medicalRecordId: primaryRecord.id,
    encounterId: encounter1.id,
    doctorProfileId: primaryDoctor.profile.id,
    category: 'VITAL_SIGN',
    code: 'DIASTOLIC_BP',
    label: 'Tension artérielle diastolique',
    valueNumeric: 82,
    unit: 'mmHg',
    observedAt: new Date(now.getTime() - 10 * day)
  });
  await ensureObservation({
    medicalRecordId: primaryRecord.id,
    encounterId: encounter1.id,
    doctorProfileId: primaryDoctor.profile.id,
    category: 'LABORATORY',
    code: 'HBA1C',
    label: 'Hémoglobine glyquée (HbA1c)',
    valueNumeric: 5.6,
    unit: '%',
    observedAt: new Date(now.getTime() - 10 * day)
  });
  await ensureObservation({
    medicalRecordId: primaryRecord.id,
    encounterId: encounter1.id,
    doctorProfileId: primaryDoctor.profile.id,
    category: 'SYMPTOM',
    label: 'Aucune allergie connue rapportée',
    certainty: 'NEGATED',
    observedAt: new Date(now.getTime() - 10 * day)
  });

  await ensureDiagnosis({
    medicalRecordId: primaryRecord.id,
    encounterId: encounter1.id,
    doctorProfileId: primaryDoctor.profile.id,
    code: 'R51',
    label: 'Céphalée',
    description: 'Céphalée primaire sans signe d’alarme.',
    status: 'CONFIRMED',
    diagnosedAt: new Date(now.getTime() - 10 * day)
  });

  await ensureAllergy({
    medicalRecordId: primaryRecord.id,
    doctorProfileId: primaryDoctor.profile.id,
    allergen: 'Pénicilline',
    reaction: 'Éruption cutanée',
    severity: 'MODERATE',
    source: 'PATIENT_REPORTED',
    certainty: 'KNOWN',
    status: 'ACTIVE',
    recordedAt: new Date(now.getTime() - 10 * day)
  });

  // --- Documents du dossier (métadonnées + contenu hors base) -------------
  await upsertDemoDocument({
    medicalRecordId: primaryRecord.id,
    encounterId: encounter1.id,
    category: 'REPORT',
    originalName: 'compte-rendu-consultation-demo.png',
    seedText: 'Compte rendu de consultation fictif (démonstration).',
    uploadedByUserId: primaryDoctor.user.id,
    uploaderDoctorProfileId: primaryDoctor.profile.id
  });
  await upsertDemoDocument({
    medicalRecordId: primaryRecord.id,
    encounterId: encounter1.id,
    category: 'LAB_RESULT',
    originalName: 'resultat-biologie-demo.png',
    seedText: 'Résultat de biologie fictif (démonstration).',
    uploadedByUserId: primaryDoctor.user.id,
    uploaderDoctorProfileId: primaryDoctor.profile.id
  });
  await upsertDemoDocument({
    medicalRecordId: primaryRecord.id,
    category: 'PRESCRIPTION',
    originalName: 'ordonnance-demo.png',
    seedText: 'Ordonnance fictive (démonstration).',
    uploadedByUserId: primaryPatient.id,
    uploaderDoctorProfileId: null
  });

  await prisma.medicalRecordAccessEvent.create({
    data: {
      medicalRecordId: primaryRecord.id,
      actorUserId: primaryPatient.id,
      action: 'DOCUMENT_UPLOADED',
      purpose: 'PATIENT_SELF',
      targetType: 'MedicalDocument',
      targetId: null
    }
  });

  // --- Trace d'un acces refuse (demonstration d'auditabilite) -------------
  // Le praticien non verifie tente d'acceder au dossier : refus journalise.
  // La table est append-only AUCUNE mise a jour possible : on garde donc le
  // seed idempotent en n'ecrivant l'evenement que s'il n'existe pas deja
  // (sinon chaque re-execution du seed empilerait un doublon d'audit).
  const existingDenial = await prisma.medicalRecordAccessEvent.findFirst({
    where: {
      medicalRecordId: primaryRecord.id,
      actorUserId: secondaryDoctor.user.id,
      action: 'ACCESS_DENIED'
    }
  });
  if (!existingDenial) {
    await prisma.medicalRecordAccessEvent.create({
      data: {
        medicalRecordId: primaryRecord.id,
        actorUserId: secondaryDoctor.user.id,
        actorDoctorProfileId: secondaryDoctor.profile.id,
        action: 'ACCESS_DENIED',
        purpose: 'EXPLICIT_GRANT',
        reason: 'unverified_profile'
      }
    });
  }

  // Le second patient garde un dossier vide (aucune donnée clinique) : utile
  // pour démontrer qu'un médecin sans consentement ne voit rien.
  void secondaryRecord;

  console.log(
    `Seeded ${specialtyCount} demonstration specialties, ` +
      `${facilitiesById.length} demonstration facilities, ` +
      '3 demo doctors/staff accounts, 2 demo patients, appointments, ' +
      'consents, a clinical record and synthetic documents.'
  );
  console.log(`Demo accounts password: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
