import type { FhirExportSource } from '../fhir.sources';

// Jeu de donnees SYNTHETIQUES et DETERMINISTES pour l'export de demonstration.
// Aucune donnee reelle : identifiants fixes, contenus fictifs, horodatage fixe.
// Ce fichier ne lit jamais la base de donnees.

// Horodatage fixe du Bundle de demonstration : garantit un resultat stable
// (meme entree -> meme sortie).
export const DEMO_BUNDLE_TIMESTAMP = new Date('2026-01-01T00:00:00.000Z');
export const DEMO_BUNDLE_ID = 'sahatn-demo-bundle';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const PRACTITIONER_ID = '22222222-2222-4222-8222-222222222222';
const ORGANIZATION_ID = '33333333-3333-4333-8333-333333333333';
const ENCOUNTER_ID = '44444444-4444-4444-8444-444444444444';
const OBSERVATION_ID = '55555555-5555-4555-8555-555555555555';
const CONDITION_ID = '66666666-6666-4666-8666-666666666666';
const ALLERGY_ID = '77777777-7777-4777-8777-777777777777';
const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888';

export function buildDemoSource(): FhirExportSource {
  return {
    patient: {
      id: PATIENT_ID,
      active: true,
      email: 'patient.demo@example.tn',
      phone: '+21600000000'
    },
    practitioners: [
      {
        id: PRACTITIONER_ID,
        displayName: 'Dr Demo Exemple',
        languages: ['fr', 'ar'],
        specialtyLabels: ['Medecine generale'],
        verificationStatus: 'VERIFIED'
      }
    ],
    organizations: [
      {
        id: ORGANIZATION_ID,
        displayName: 'Centre de sante demo',
        officialName: 'Centre de sante demo de Tunis',
        description: 'Etablissement fictif de demonstration.',
        addressLine: '1 Rue de la Demo',
        city: 'Tunis',
        governorate: 'TUNIS',
        delegation: 'Tunis Ville',
        postalCode: '1000',
        phone: '+21600000001',
        websiteUrl: 'https://demo.example.tn',
        licenseReference: 'DEMO-LIC-0001',
        verificationStatus: 'VERIFIED'
      }
    ],
    encounters: [
      {
        id: ENCOUNTER_ID,
        type: 'CONSULTATION',
        occurredAt: new Date('2026-01-01T09:00:00.000Z'),
        doctorProfileId: PRACTITIONER_ID,
        facilityId: ORGANIZATION_ID,
        appointmentId: null,
        chiefComplaint: 'Fievre et fatigue',
        notes: 'Examen sans signe de gravite (non exporte dans Encounter R4).',
        recordStatus: 'ACTIVE'
      }
    ],
    observations: [
      {
        id: OBSERVATION_ID,
        encounterId: ENCOUNTER_ID,
        category: 'VITAL_SIGN',
        code: null,
        label: 'Temperature corporelle',
        valueText: null,
        valueNumeric: 38.5,
        unit: 'Cel',
        certainty: 'KNOWN',
        observedAt: new Date('2026-01-01T09:10:00.000Z'),
        doctorProfileId: PRACTITIONER_ID,
        recordStatus: 'ACTIVE'
      }
    ],
    conditions: [
      {
        id: CONDITION_ID,
        encounterId: ENCOUNTER_ID,
        code: null,
        label: 'Syndrome grippal',
        description: 'Diagnostic de demonstration.',
        status: 'PROVISIONAL',
        diagnosedAt: new Date('2026-01-01T09:20:00.000Z'),
        doctorProfileId: PRACTITIONER_ID,
        recordStatus: 'ACTIVE'
      }
    ],
    allergies: [
      {
        id: ALLERGY_ID,
        allergen: 'Penicilline',
        reaction: 'Eruption cutanee',
        severity: 'MODERATE',
        source: 'PROFESSIONAL_DOCUMENTED',
        certainty: 'KNOWN',
        status: 'ACTIVE',
        recordedAt: new Date('2026-01-01T09:30:00.000Z'),
        doctorProfileId: PRACTITIONER_ID,
        recordStatus: 'ACTIVE'
      }
    ],
    documents: [
      {
        id: DOCUMENT_ID,
        category: 'REPORT',
        originalName: 'compte-rendu-demo.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 12345,
        status: 'ACTIVE',
        encounterId: ENCOUNTER_ID,
        createdAt: new Date('2026-01-01T09:40:00.000Z'),
        uploadedByUserId: PATIENT_ID,
        uploaderDoctorProfileId: PRACTITIONER_ID
      }
    ]
  };
}
