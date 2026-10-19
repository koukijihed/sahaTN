import { FHIR_PROFILE, FHIR_SYSTEM } from '../fhir.constants';
import type { ObservationSource } from '../fhir.sources';
import type {
  FhirCodeableConcept,
  FhirObservation,
  FhirObservationStatus
} from '../fhir.types';
import { lookup, meta, reference, toInstant } from './converter-support';

// Categorie d'observation : seules les correspondances FIABLES vers le
// CodeSystem `observation-category` sont codees. Les autres categories sont
// exportees en texte libre (aucune correspondance inventee).
const OBSERVATION_CATEGORY: Record<ObservationSource['category'], FhirCodeableConcept> = {
  VITAL_SIGN: {
    coding: [
      {
        system: FHIR_SYSTEM.observationCategory,
        code: 'vital-signs',
        display: 'Vital Signs'
      }
    ],
    text: 'Signe vital'
  },
  LABORATORY: {
    coding: [
      {
        system: FHIR_SYSTEM.observationCategory,
        code: 'laboratory',
        display: 'Laboratory'
      }
    ],
    text: 'Laboratoire'
  },
  SYMPTOM: { text: 'Symptome' },
  MEASUREMENT: { text: 'Mesure' },
  EXAM_RESULT: { text: "Resultat d'examen" },
  OTHER: { text: 'Autre' }
};

// Mapping SahaTN ClinicalObservation -> FHIR Observation (R4).
//
// `patientId` provient du pole d'assemblage.
//
// Limites :
// - `code.coding` : la source fournit un `code` libre sans systeme de
//   nomenclature connu ; il est conserve tel quel (sans `system`) et accompagne
//   du libelle en `text`. Aucun codage LOINC/SNOMED n'est devine.
// - `valueQuantity.unit` : l'unite est un texte libre (pas de codage UCUM).
// - certitude NEGATED -> `valueCodeableConcept` « Negatif » ; UNKNOWN ->
//   `dataAbsentReason` (CodeSystem HL7 data-absent-reason).
export function toFhirObservation(
  source: ObservationSource,
  patientId: string
): FhirObservation {
  const status: FhirObservationStatus =
    source.recordStatus === 'ENTERED_IN_ERROR' ? 'entered-in-error' : 'final';

  const code: FhirCodeableConcept = { text: source.label };
  if (source.code) {
    code.coding = [{ code: source.code }];
  }

  const observation: FhirObservation = {
    resourceType: 'Observation',
    id: source.id,
    meta: meta(FHIR_PROFILE.observation),
    status,
    category: [lookup(OBSERVATION_CATEGORY, source.category, 'observation category')],
    code,
    subject: reference('Patient', patientId),
    effectiveDateTime: toInstant(source.observedAt),
    performer: [reference('Practitioner', source.doctorProfileId)]
  };

  if (source.encounterId) {
    observation.encounter = reference('Encounter', source.encounterId);
  }

  if (source.valueNumeric !== null) {
    observation.valueQuantity = { value: source.valueNumeric };
    if (source.unit) {
      observation.valueQuantity.unit = source.unit;
    }
  } else if (source.valueText !== null) {
    observation.valueString = source.valueText;
  } else if (source.certainty === 'NEGATED') {
    observation.valueCodeableConcept = { text: 'Negatif' };
  } else if (source.certainty === 'UNKNOWN') {
    observation.dataAbsentReason = {
      coding: [{ system: FHIR_SYSTEM.dataAbsentReason, code: 'unknown' }]
    };
  }

  return observation;
}
