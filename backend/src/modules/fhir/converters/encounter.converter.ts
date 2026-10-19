import { FHIR_PROFILE, FHIR_SYSTEM } from '../fhir.constants';
import type { EncounterSource } from '../fhir.sources';
import type { FhirCoding, FhirCodeableConcept, FhirEncounter, FhirEncounterStatus } from '../fhir.types';
import { lookup, meta, reference, toInstant } from './converter-support';

// Correspondance ClinicalEncounterType -> class (v3 ActCode). Les valeurs de
// `class` proviennent d'un CodeSystem HL7 publie.
const ENCOUNTER_CLASS: Record<EncounterSource['type'], FhirCoding> = {
  CONSULTATION: { system: FHIR_SYSTEM.v3ActCode, code: 'AMB', display: 'ambulatory' },
  FOLLOW_UP: { system: FHIR_SYSTEM.v3ActCode, code: 'AMB', display: 'ambulatory' },
  TELECONSULTATION: { system: FHIR_SYSTEM.v3ActCode, code: 'VR', display: 'virtual' },
  EMERGENCY: { system: FHIR_SYSTEM.v3ActCode, code: 'EMER', display: 'emergency' },
  OTHER: { system: FHIR_SYSTEM.v3ActCode, code: 'AMB', display: 'ambulatory' }
};

// Libelle humain du type de rencontre (non code : pas de terminologie standard
// tunisienne validee).
const ENCOUNTER_TYPE_LABEL: Record<EncounterSource['type'], string> = {
  CONSULTATION: 'Consultation',
  FOLLOW_UP: 'Consultation de suivi',
  TELECONSULTATION: 'Teleconsultation',
  EMERGENCY: 'Urgence',
  OTHER: 'Rencontre'
};

// Mapping SahaTN ClinicalEncounter -> FHIR Encounter (R4).
//
// `patientId` est l'identifiant technique du patient (proprietaire du dossier) :
// il est fourni par le pole d'assemblage pour garantir des references
// coherentes.
//
// Limites :
// - `status` : un encounter clinique SahaTN enregistre est considere `finished`
//   (il a eu lieu) ; ENTERED_IN_ERROR -> `entered-in-error`. Les etats de
//   workflow FHIR (planned, arrived, in-progress) ne sont pas modelises.
// - `notes` : Encounter R4 ne possede pas d'element `note` ; les notes libres ne
//   sont pas exportees (voir limitations du mapping).
export function toFhirEncounter(
  source: EncounterSource,
  patientId: string
): FhirEncounter {
  const status: FhirEncounterStatus =
    source.recordStatus === 'ENTERED_IN_ERROR' ? 'entered-in-error' : 'finished';

  const type: FhirCodeableConcept = {
    text: lookup(ENCOUNTER_TYPE_LABEL, source.type, 'encounter type')
  };

  const encounter: FhirEncounter = {
    resourceType: 'Encounter',
    id: source.id,
    meta: meta(FHIR_PROFILE.encounter),
    status,
    class: lookup(ENCOUNTER_CLASS, source.type, 'encounter class'),
    type: [type],
    subject: reference('Patient', patientId),
    participant: [{ individual: reference('Practitioner', source.doctorProfileId) }],
    period: { start: toInstant(source.occurredAt) }
  };

  if (source.facilityId) {
    encounter.serviceProvider = reference('Organization', source.facilityId);
  }
  if (source.chiefComplaint) {
    encounter.reasonCode = [{ text: source.chiefComplaint }];
  }

  return encounter;
}
