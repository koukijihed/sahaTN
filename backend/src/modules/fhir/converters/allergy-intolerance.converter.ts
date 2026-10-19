import { FHIR_PROFILE, FHIR_SYSTEM } from '../fhir.constants';
import type { AllergyIntoleranceSource } from '../fhir.sources';
import type {
  FhirAllergyCriticality,
  FhirAllergyIntolerance,
  FhirCodeableConcept
} from '../fhir.types';
import { lookup, meta, reference, toInstant } from './converter-support';

// clinicalStatus (CodeSystem allergyintolerance-clinical).
const ALLERGY_CLINICAL: Record<
  AllergyIntoleranceSource['status'],
  FhirCodeableConcept
> = {
  ACTIVE: {
    coding: [
      { system: FHIR_SYSTEM.allergyClinical, code: 'active', display: 'Active' }
    ]
  },
  RESOLVED: {
    coding: [
      { system: FHIR_SYSTEM.allergyClinical, code: 'resolved', display: 'Resolved' }
    ]
  }
};

// verificationStatus (CodeSystem allergyintolerance-verification) derive de la
// certitude clinique.
const ALLERGY_VERIFICATION: Record<
  AllergyIntoleranceSource['certainty'],
  FhirCodeableConcept
> = {
  KNOWN: {
    coding: [
      {
        system: FHIR_SYSTEM.allergyVerification,
        code: 'confirmed',
        display: 'Confirmed'
      }
    ]
  },
  NEGATED: {
    coding: [
      {
        system: FHIR_SYSTEM.allergyVerification,
        code: 'refuted',
        display: 'Refuted'
      }
    ]
  },
  UNKNOWN: {
    coding: [
      {
        system: FHIR_SYSTEM.allergyVerification,
        code: 'unconfirmed',
        display: 'Unconfirmed'
      }
    ]
  }
};

// criticality FHIR deduit de la severite SahaTN (jugement a valider).
const ALLERGY_CRITICALITY: Record<
  NonNullable<AllergyIntoleranceSource['severity']>,
  FhirAllergyCriticality
> = {
  MILD: 'low',
  MODERATE: 'low',
  SEVERE: 'high',
  LIFE_THREATENING: 'high',
  UNKNOWN: 'unable-to-assess'
};

const ALLERGY_REACTION_SEVERITY: Record<
  NonNullable<AllergyIntoleranceSource['severity']>,
  'mild' | 'moderate' | 'severe' | undefined
> = {
  MILD: 'mild',
  MODERATE: 'moderate',
  SEVERE: 'severe',
  LIFE_THREATENING: 'severe',
  UNKNOWN: undefined
};

// Mapping SahaTN PatientAllergy -> FHIR AllergyIntolerance (R4).
//
// Limites :
// - `code` : l'allergene est un texte libre ; exporte en `text` uniquement
//   (aucun codage RxNorm/SNOMED devine).
// - `type` / `category` : non disponibles dans le modele source -> omis.
// - `source` (origine declaree) n'est pas exportee : la certitude pilote la
//   verificationStatus.
export function toFhirAllergyIntolerance(
  source: AllergyIntoleranceSource,
  patientId: string
): FhirAllergyIntolerance {
  const allergy: FhirAllergyIntolerance = {
    resourceType: 'AllergyIntolerance',
    id: source.id,
    meta: meta(FHIR_PROFILE.allergyIntolerance),
    clinicalStatus: lookup(ALLERGY_CLINICAL, source.status, 'allergy clinical status'),
    verificationStatus: lookup(
      ALLERGY_VERIFICATION,
      source.certainty,
      'allergy verification status'
    ),
    code: { text: source.allergen },
    patient: reference('Patient', patientId),
    recordedDate: toInstant(source.recordedAt),
    recorder: reference('Practitioner', source.doctorProfileId)
  };

  if (source.severity) {
    allergy.criticality = lookup(
      ALLERGY_CRITICALITY,
      source.severity,
      'allergy criticality'
    );
  }

  if (source.reaction) {
    const reaction: { manifestation: FhirCodeableConcept[]; severity?: 'mild' | 'moderate' | 'severe' } =
      { manifestation: [{ text: source.reaction }] };
    if (source.severity) {
      const severity = lookup(
        ALLERGY_REACTION_SEVERITY,
        source.severity,
        'allergy reaction severity'
      );
      if (severity) {
        reaction.severity = severity;
      }
    }
    allergy.reaction = [reaction];
  }

  return allergy;
}
