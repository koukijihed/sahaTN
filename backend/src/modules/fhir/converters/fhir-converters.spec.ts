import { SAHATN_ID_SYSTEM } from '../fhir.constants';
import type {
  AllergyIntoleranceSource,
  ConditionSource,
  DocumentSource,
  EncounterSource,
  ObservationSource,
  OrganizationSource,
  PatientSource,
  PractitionerSource
} from '../fhir.sources';
import { UnsupportedFhirMappingError } from './converter-support';
import { toFhirPatient } from './patient.converter';
import { toFhirPractitioner } from './practitioner.converter';
import { toFhirOrganization } from './organization.converter';
import { toFhirEncounter } from './encounter.converter';
import { toFhirObservation } from './observation.converter';
import { toFhirCondition } from './condition.converter';
import { toFhirAllergyIntolerance } from './allergy-intolerance.converter';
import {
  sanitizeAttachmentTitle,
  toFhirDocumentReference
} from './document-reference.converter';
import { toFhirProvenance } from './provenance.converter';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';

function patient(overrides: Partial<PatientSource> = {}): PatientSource {
  return {
    id: PATIENT_ID,
    active: true,
    email: 'patient@example.tn',
    phone: '+21600000000',
    ...overrides
  };
}

describe('FHIR converters', () => {
  describe('Patient', () => {
    it('maps identity, active state and contact points (not as identifiers)', () => {
      const result = toFhirPatient(patient());
      expect(result.resourceType).toBe('Patient');
      expect(result.id).toBe(PATIENT_ID);
      expect(result.active).toBe(true);
      expect(result.telecom).toEqual([
        { system: 'email', value: 'patient@example.tn', use: 'home' },
        { system: 'phone', value: '+21600000000', use: 'mobile' }
      ]);
      // Aucun identifiant national ; identifiant local urn, marque secondary.
      const identifier = result.identifier ?? [];
      expect(identifier).toHaveLength(1);
      expect(identifier[0].system).toBe(SAHATN_ID_SYSTEM.patient);
      expect(identifier[0].use).toBe('secondary');
      // E-mail / telephone ne doivent JAMAIS servir d'identifiant.
      expect(identifier.some((id) => id.value === 'patient@example.tn')).toBe(false);
      expect(identifier.some((id) => id.value === '+21600000000')).toBe(false);
    });

    it('omits absent fields (name, telecom) when not available', () => {
      const result = toFhirPatient(patient({ email: null, phone: null }));
      expect(result.telecom).toBeUndefined();
      expect(result.name).toBeUndefined();
      expect('birthDate' in result).toBe(false);
      expect('gender' in result).toBe(false);
    });

    it('marks an inactive user as inactive', () => {
      expect(toFhirPatient(patient({ active: false })).active).toBe(false);
    });
  });

  describe('Practitioner', () => {
    const source: PractitionerSource = {
      id: '22222222-2222-4222-8222-222222222222',
      displayName: 'Dr Exemple',
      languages: ['fr', 'ar'],
      specialtyLabels: ['Cardiologie'],
      verificationStatus: 'VERIFIED'
    };

    it('maps name, languages (BCP-47) and specialties to text', () => {
      const result = toFhirPractitioner(source);
      expect(result.resourceType).toBe('Practitioner');
      expect(result.active).toBe(true);
      expect(result.name).toEqual([{ text: 'Dr Exemple' }]);
      expect(result.communication).toEqual([
        { coding: [{ system: 'urn:ietf:bcp:47', code: 'fr' }] },
        { coding: [{ system: 'urn:ietf:bcp:47', code: 'ar' }] }
      ]);
      expect(result.qualification).toEqual([{ code: { text: 'Cardiologie' } }]);
      expect(result.identifier?.[0].system).toBe(SAHATN_ID_SYSTEM.practitioner);
    });

    it('marks a non-verified professional as inactive and omits empty arrays', () => {
      const result = toFhirPractitioner({
        ...source,
        verificationStatus: 'PENDING',
        languages: [],
        specialtyLabels: []
      });
      expect(result.active).toBe(false);
      expect(result.communication).toBeUndefined();
      expect(result.qualification).toBeUndefined();
    });
  });

  describe('Organization', () => {
    const source: OrganizationSource = {
      id: '33333333-3333-4333-8333-333333333333',
      displayName: 'Clinique Exemple',
      officialName: 'Clinique Exemple de Tunis',
      description: null,
      addressLine: '1 Rue Exemple',
      city: 'Tunis',
      governorate: 'TUNIS',
      delegation: 'Bab Bhar',
      postalCode: '1000',
      phone: '+21600000001',
      websiteUrl: 'https://clinique.example.tn',
      licenseReference: 'LIC-0001',
      verificationStatus: 'VERIFIED'
    };

    it('uses official name, alias and a Tunisian address', () => {
      const result = toFhirOrganization(source);
      expect(result.name).toBe('Clinique Exemple de Tunis');
      expect(result.alias).toEqual(['Clinique Exemple']);
      expect(result.address?.[0]).toMatchObject({
        city: 'Tunis',
        state: 'TUNIS',
        district: 'Bab Bhar',
        postalCode: '1000',
        country: 'TN'
      });
      // La reference de licence est un identifiant LOCAL (urn), pas national.
      expect(result.identifier?.[0].system).toBe(SAHATN_ID_SYSTEM.facilityLicense);
    });

    it('omits license identifier when absent', () => {
      const result = toFhirOrganization({ ...source, licenseReference: null });
      expect(result.identifier).toBeUndefined();
    });
  });

  describe('Encounter', () => {
    const base: EncounterSource = {
      id: '44444444-4444-4444-8444-444444444444',
      type: 'CONSULTATION',
      occurredAt: new Date('2026-01-01T09:00:00.000Z'),
      doctorProfileId: '22222222-2222-4222-8222-222222222222',
      facilityId: '33333333-3333-4333-8333-333333333333',
      appointmentId: null,
      chiefComplaint: 'Fievre',
      notes: 'note interne',
      recordStatus: 'ACTIVE'
    };

    it('maps status, class, subject, participant and provider', () => {
      const result = toFhirEncounter(base, PATIENT_ID);
      expect(result.status).toBe('finished');
      expect(result.class.code).toBe('AMB');
      expect(result.subject?.reference).toBe(`Patient/${PATIENT_ID}`);
      expect(result.participant?.[0].individual?.reference).toBe(
        'Practitioner/22222222-2222-4222-8222-222222222222'
      );
      expect(result.serviceProvider?.reference).toBe(
        'Organization/33333333-3333-4333-8333-333333333333'
      );
      expect(result.period?.start).toBe('2026-01-01T09:00:00.000Z');
      expect(result.reasonCode?.[0].text).toBe('Fievre');
    });

    it('maps each encounter type to a class and rejects unknown values', () => {
      expect(toFhirEncounter({ ...base, type: 'EMERGENCY' }, PATIENT_ID).class.code).toBe('EMER');
      expect(toFhirEncounter({ ...base, type: 'TELECONSULTATION' }, PATIENT_ID).class.code).toBe('VR');
      expect(toFhirEncounter({ ...base, type: 'OTHER' }, PATIENT_ID).class.code).toBe('AMB');
      expect(() =>
        toFhirEncounter(
          { ...base, type: 'BOGUS' as unknown as EncounterSource['type'] },
          PATIENT_ID
        )
      ).toThrow(UnsupportedFhirMappingError);
    });

    it('maps ENTERED_IN_ERROR to entered-in-error', () => {
      expect(
        toFhirEncounter({ ...base, recordStatus: 'ENTERED_IN_ERROR' }, PATIENT_ID).status
      ).toBe('entered-in-error');
    });
  });

  describe('Observation', () => {
    const base: ObservationSource = {
      id: '55555555-5555-4555-8555-555555555555',
      encounterId: '44444444-4444-4444-8444-444444444444',
      category: 'VITAL_SIGN',
      code: null,
      label: 'Temperature',
      valueText: null,
      valueNumeric: 38.5,
      unit: 'Cel',
      certainty: 'KNOWN',
      observedAt: new Date('2026-01-01T09:10:00.000Z'),
      doctorProfileId: '22222222-2222-4222-8222-222222222222',
      recordStatus: 'ACTIVE'
    };

    it('maps vital signs with a coded category and quantity value', () => {
      const result = toFhirObservation(base, PATIENT_ID);
      expect(result.status).toBe('final');
      expect(result.category?.[0].coding?.[0].code).toBe('vital-signs');
      expect(result.valueQuantity).toEqual({ value: 38.5, unit: 'Cel' });
      expect(result.encounter?.reference).toBe(
        'Encounter/44444444-4444-4444-8444-444444444444'
      );
    });

    it('keeps an unknown source code without inventing a system', () => {
      const result = toFhirObservation({ ...base, code: 'LOCAL-123' }, PATIENT_ID);
      expect(result.code.coding).toEqual([{ code: 'LOCAL-123' }]);
      expect(result.code.coding?.[0].system).toBeUndefined();
    });

    it('represents explicit negative and unknown as text / data-absent-reason', () => {
      const negated = toFhirObservation(
        { ...base, valueNumeric: null, certainty: 'NEGATED' },
        PATIENT_ID
      );
      expect(negated.valueCodeableConcept?.text).toBe('Negatif');
      const unknown = toFhirObservation(
        { ...base, valueNumeric: null, certainty: 'UNKNOWN' },
        PATIENT_ID
      );
      expect(unknown.dataAbsentReason?.coding?.[0].code).toBe('unknown');
      expect(unknown.valueQuantity).toBeUndefined();
    });

    it('exports valueString when only text is available', () => {
      const result = toFhirObservation(
        { ...base, valueNumeric: null, valueText: 'Normale' },
        PATIENT_ID
      );
      expect(result.valueString).toBe('Normale');
    });

    it('rejects an unsupported category', () => {
      expect(() =>
        toFhirObservation(
          { ...base, category: 'NOPE' as unknown as ObservationSource['category'] },
          PATIENT_ID
        )
      ).toThrow(UnsupportedFhirMappingError);
    });
  });

  describe('Condition', () => {
    const base: ConditionSource = {
      id: '66666666-6666-4666-8666-666666666666',
      encounterId: '44444444-4444-4444-8444-444444444444',
      code: null,
      label: 'Syndrome grippal',
      description: 'Diagnostic de demo',
      status: 'CONFIRMED',
      diagnosedAt: new Date('2026-01-01T09:20:00.000Z'),
      doctorProfileId: '22222222-2222-4222-8222-222222222222',
      recordStatus: 'ACTIVE'
    };

    it('maps status/verification and category', () => {
      const result = toFhirCondition(base, PATIENT_ID);
      expect(result.clinicalStatus?.coding?.[0].code).toBe('active');
      expect(result.verificationStatus?.coding?.[0].code).toBe('confirmed');
      expect(result.category?.[0].coding?.[0].code).toBe('encounter-diagnosis');
      expect(result.note?.[0].text).toBe('Diagnostic de demo');
      expect(result.subject?.reference).toBe(`Patient/${PATIENT_ID}`);
    });

    it('maps each diagnosis status and rejects unknown', () => {
      expect(
        toFhirCondition({ ...base, status: 'PROVISIONAL' }, PATIENT_ID).verificationStatus
          ?.coding?.[0].code
      ).toBe('provisional');
      expect(
        toFhirCondition({ ...base, status: 'RESOLVED' }, PATIENT_ID).clinicalStatus?.coding?.[0]
          .code
      ).toBe('resolved');
      expect(
        toFhirCondition({ ...base, status: 'REFUTED' }, PATIENT_ID).verificationStatus?.coding?.[0]
          .code
      ).toBe('refuted');
      expect(() =>
        toFhirCondition(
          { ...base, status: 'BOGUS' as unknown as ConditionSource['status'] },
          PATIENT_ID
        )
      ).toThrow(UnsupportedFhirMappingError);
    });
  });

  describe('AllergyIntolerance', () => {
    const base: AllergyIntoleranceSource = {
      id: '77777777-7777-4777-8777-777777777777',
      allergen: 'Penicilline',
      reaction: 'Eruption',
      severity: 'SEVERE',
      source: 'PROFESSIONAL_DOCUMENTED',
      certainty: 'KNOWN',
      status: 'ACTIVE',
      recordedAt: new Date('2026-01-01T09:30:00.000Z'),
      doctorProfileId: '22222222-2222-4222-8222-222222222222',
      recordStatus: 'ACTIVE'
    };

    it('maps clinical status, verification, criticality and reaction', () => {
      const result = toFhirAllergyIntolerance(base, PATIENT_ID);
      expect(result.patient.reference).toBe(`Patient/${PATIENT_ID}`);
      expect(result.clinicalStatus?.coding?.[0].code).toBe('active');
      expect(result.verificationStatus?.coding?.[0].code).toBe('confirmed');
      expect(result.criticality).toBe('high');
      expect(result.reaction?.[0]).toEqual({
        manifestation: [{ text: 'Eruption' }],
        severity: 'severe'
      });
      expect(result.recorder?.reference).toBe(
        'Practitioner/22222222-2222-4222-8222-222222222222'
      );
    });

    it('maps negated certainty to refuted and omits reaction without text', () => {
      const result = toFhirAllergyIntolerance(
        { ...base, certainty: 'NEGATED', reaction: null },
        PATIENT_ID
      );
      expect(result.verificationStatus?.coding?.[0].code).toBe('refuted');
      expect(result.reaction).toBeUndefined();
    });

    it('rejects an unsupported certainty', () => {
      expect(() =>
        toFhirAllergyIntolerance(
          { ...base, certainty: 'MAYBE' as unknown as AllergyIntoleranceSource['certainty'] },
          PATIENT_ID
        )
      ).toThrow(UnsupportedFhirMappingError);
    });
  });

  describe('DocumentReference', () => {
    const base: DocumentSource = {
      id: '88888888-8888-4888-8888-888888888888',
      category: 'REPORT',
      originalName: 'compte-rendu.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
      status: 'ACTIVE',
      encounterId: '44444444-4444-4444-8444-444444444444',
      createdAt: new Date('2026-01-01T09:40:00.000Z'),
      uploadedByUserId: PATIENT_ID,
      uploaderDoctorProfileId: '22222222-2222-4222-8222-222222222222'
    };

    it('exports metadata only (no storageKey, no url, no binary data)', () => {
      const result = toFhirDocumentReference(base, PATIENT_ID);
      expect(result.status).toBe('current');
      expect(result.docStatus).toBe('final');
      expect(result.content[0].attachment).toEqual({
        contentType: 'application/pdf',
        title: 'compte-rendu.pdf',
        size: 12345,
        creation: '2026-01-01T09:40:00.000Z'
      });
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('storageKey');
      expect(serialized).not.toContain('private-documents');
      expect(serialized).not.toContain('"url"');
      const attachment = result.content[0].attachment as unknown as Record<string, unknown>;
      expect(attachment.url).toBeUndefined();
      expect(attachment.data).toBeUndefined();
    });

    it('maps ARCHIVED to superseded and omits author when unknown', () => {
      const result = toFhirDocumentReference(
        { ...base, status: 'ARCHIVED', uploaderDoctorProfileId: null },
        PATIENT_ID
      );
      expect(result.status).toBe('superseded');
      expect(result.author).toBeUndefined();
      expect(result.context?.encounter?.[0].reference).toBe(
        'Encounter/44444444-4444-4444-8444-444444444444'
      );
    });

    it('rejects an unsupported category', () => {
      expect(() =>
        toFhirDocumentReference(
          { ...base, category: 'X' as unknown as DocumentSource['category'] },
          PATIENT_ID
        )
      ).toThrow(UnsupportedFhirMappingError);
    });

    it('sanitizes the attachment title against path leakage', () => {
      expect(sanitizeAttachmentTitle('rapport.pdf')).toBe('rapport.pdf');
      expect(sanitizeAttachmentTitle('a/b/c/rapport.pdf')).toBe('rapport.pdf');
      expect(sanitizeAttachmentTitle('..\\windowspath\\x.pdf')).toBe('x.pdf');
      expect(sanitizeAttachmentTitle('   ')).toBe('document');
      const result = toFhirDocumentReference(
        { ...base, originalName: 'documents/2026/01/secret-id' },
        PATIENT_ID
      );
      expect(result.content[0].attachment.title).toBe('secret-id');
      expect(JSON.stringify(result)).not.toContain('documents/2026/01');
    });
  });

  describe('Provenance', () => {
    it('references the target document and its identified author', () => {
      const result = toFhirProvenance({
        documentId: '88888888-8888-4888-8888-888888888888',
        authorPractitionerId: '22222222-2222-4222-8222-222222222222',
        recordedAt: new Date('2026-01-01T09:40:00.000Z')
      });
      expect(result.id).toBe('prov-88888888-8888-4888-8888-888888888888');
      expect(result.target[0].reference).toBe(
        'DocumentReference/88888888-8888-4888-8888-888888888888'
      );
      expect(result.agent[0].who.reference).toBe(
        'Practitioner/22222222-2222-4222-8222-222222222222'
      );
      expect(result.agent[0].type?.coding?.[0].code).toBe('author');
    });
  });
});
