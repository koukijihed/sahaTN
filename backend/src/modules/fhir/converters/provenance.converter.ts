import { FHIR_PROFILE, FHIR_SYSTEM } from '../fhir.constants';
import type { FhirProvenance } from '../fhir.types';
import { meta, reference, toInstant } from './converter-support';

// Mapping vers FHIR Provenance (R4).
//
// Provenance n'est produite QUE lorsque l'auteur est reellement connu : un
// document depose par un professionnel identifie. On ne fabrique JAMAIS de
// provenance historique pour une donnee dont l'origine est inconnue.
export function toFhirProvenance(input: {
  documentId: string;
  authorPractitionerId: string;
  recordedAt: Date;
}): FhirProvenance {
  return {
    resourceType: 'Provenance',
    id: `prov-${input.documentId}`,
    meta: meta(FHIR_PROFILE.provenance),
    target: [reference('DocumentReference', input.documentId)],
    recorded: toInstant(input.recordedAt),
    agent: [
      {
        type: {
          coding: [
            {
              system: FHIR_SYSTEM.provenanceParticipantType,
              code: 'author',
              display: 'Author'
            }
          ]
        },
        who: reference('Practitioner', input.authorPractitionerId)
      }
    ]
  };
}
