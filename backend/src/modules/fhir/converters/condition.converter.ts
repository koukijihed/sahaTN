import { FHIR_PROFILE, FHIR_SYSTEM } from '../fhir.constants';
import type { ConditionSource } from '../fhir.sources';
import type { FhirCodeableConcept, FhirCondition } from '../fhir.types';
import { lookup, meta, reference, toInstant } from './converter-support';

interface ConditionStatusPair {
  clinical: FhirCodeableConcept;
  verification: FhirCodeableConcept;
}

// Correspondance ClinicalDiagnosisStatus -> (clinicalStatus, verificationStatus)
// en utilisant les CodeSystems HL7 `condition-clinical` et
// `condition-ver-status`.
const CONDITION_STATUS: Record<ConditionSource['status'], ConditionStatusPair> = {
  PROVISIONAL: {
    clinical: {
      coding: [{ system: FHIR_SYSTEM.conditionClinical, code: 'active', display: 'Active' }]
    },
    verification: {
      coding: [
        { system: FHIR_SYSTEM.conditionVerStatus, code: 'provisional', display: 'Provisional' }
      ]
    }
  },
  CONFIRMED: {
    clinical: {
      coding: [{ system: FHIR_SYSTEM.conditionClinical, code: 'active', display: 'Active' }]
    },
    verification: {
      coding: [
        { system: FHIR_SYSTEM.conditionVerStatus, code: 'confirmed', display: 'Confirmed' }
      ]
    }
  },
  REFUTED: {
    clinical: {
      coding: [{ system: FHIR_SYSTEM.conditionClinical, code: 'inactive', display: 'Inactive' }]
    },
    verification: {
      coding: [
        { system: FHIR_SYSTEM.conditionVerStatus, code: 'refuted', display: 'Refuted' }
      ]
    }
  },
  RESOLVED: {
    clinical: {
      coding: [{ system: FHIR_SYSTEM.conditionClinical, code: 'resolved', display: 'Resolved' }]
    },
    verification: {
      coding: [
        { system: FHIR_SYSTEM.conditionVerStatus, code: 'confirmed', display: 'Confirmed' }
      ]
    }
  }
};

// Mapping SahaTN ClinicalDiagnosis -> FHIR Condition (R4).
//
// Limites :
// - `code.coding` : `code` source libre conserve tel quel (sans `system`) avec
//   le libelle en `text` ; aucun codage CIM-10/SNOMED n'est devine.
// - `category` : fixee a `encounter-diagnosis` (diagnostic documente dans le
//   dossier lors d'une rencontre).
export function toFhirCondition(
  source: ConditionSource,
  patientId: string
): FhirCondition {
  const pair = lookup(CONDITION_STATUS, source.status, 'condition status');

  const code: FhirCodeableConcept = { text: source.label };
  if (source.code) {
    code.coding = [{ code: source.code }];
  }

  const condition: FhirCondition = {
    resourceType: 'Condition',
    id: source.id,
    meta: meta(FHIR_PROFILE.condition),
    clinicalStatus: pair.clinical,
    verificationStatus: pair.verification,
    category: [
      {
        coding: [
          {
            system: FHIR_SYSTEM.conditionCategory,
            code: 'encounter-diagnosis',
            display: 'Encounter Diagnosis'
          }
        ]
      }
    ],
    code,
    subject: reference('Patient', patientId),
    onsetDateTime: toInstant(source.diagnosedAt),
    recordedDate: toInstant(source.diagnosedAt)
  };

  if (source.encounterId) {
    condition.encounter = reference('Encounter', source.encounterId);
  }
  if (source.description) {
    condition.note = [{ text: source.description }];
  }

  return condition;
}
