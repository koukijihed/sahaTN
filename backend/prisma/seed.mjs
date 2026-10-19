// SahaTN - Données de démonstration.
// ATTENTION : toutes ces données sont FICTIVES (ADR-0007). Elles permettent de
// développer en local sans aucune donnée réelle. Les référentiels devront
// provenir de sources institutionnelles vérifiées et être gérés par une
// procédure administrative contrôlée (voir docs/security.md).
import { Algorithm, hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEMO_PASSWORD = 'DemoPassw0rd!2024';

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

async function upsertDemoUser({ email, phone }) {
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

async function seedDemoDoctor(facilitiesById) {
  const user = await upsertDemoUser({
    email: 'demo.doctor@sahatn.example',
    phone: '+21620000001'
  });
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: 'DOCTOR' } },
    update: {},
    create: { userId: user.id, role: 'DOCTOR' }
  });

  const profile = await prisma.doctorProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      displayName: 'Dr Mounir Trabelsi',
      professionalDescription: 'Médecin généraliste de démonstration.',
      languages: ['fr', 'ar'],
      yearsOfExperience: 12,
      verificationStatus: 'VERIFIED',
      isPubliclyListed: true
    }
  });

  const general = await prisma.specialty.findUnique({
    where: { code: 'GENERAL_MEDICINE' }
  });
  const cardiology = await prisma.specialty.findUnique({
    where: { code: 'CARDIOLOGY' }
  });
  for (const [specialtyId, isPrimary] of [
    [general.id, true],
    [cardiology.id, false]
  ]) {
    await prisma.doctorSpecialty.upsert({
      where: {
        doctorProfileId_specialtyId: {
          doctorProfileId: profile.id,
          specialtyId
        }
      },
      update: { isPrimary },
      create: { doctorProfileId: profile.id, specialtyId, isPrimary }
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
        reference: 'DEMO-DIPLOME-2024',
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date()
      }
    });
  }

  const drill = await prisma.healthcareFacility.findFirst({
    where: { displayName: 'Polyclinique Les Palmiers' }
  });
  if (drill) {
    const active = await prisma.doctorFacilityAffiliation.findFirst({
      where: {
        doctorProfileId: profile.id,
        facilityId: drill.id,
        status: 'VERIFIED'
      }
    });
    if (!active) {
      await prisma.doctorFacilityAffiliation.create({
        data: {
          doctorProfileId: profile.id,
          facilityId: drill.id,
          status: 'VERIFIED',
          requestedBy: user.id,
          decidedBy: user.id,
          decidedAt: new Date()
        }
      });
    }
  }

  return profile;
}

async function seedDemoStaff(facilitiesById) {
  const user = await upsertDemoUser({
    email: 'demo.staff@sahatn.example',
    phone: '+21620000002'
  });
  await prisma.userRole.upsert({
    where: { userId_role: { userId: user.id, role: 'FACILITY_STAFF' } },
    update: {},
    create: { userId: user.id, role: 'FACILITY_STAFF' }
  });

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
  await seedDemoDoctor(facilitiesById);
  await seedDemoStaff(facilitiesById);
  console.log(
    `Seeded ${specialtyCount} demonstration specialties, ` +
      `${facilitiesById.length} demonstration facilities, ` +
      'demo doctor and demo staff accounts.'
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