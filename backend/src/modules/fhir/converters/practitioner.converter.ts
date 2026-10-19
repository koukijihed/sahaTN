import { FHIR_PROFILE, FHIR_SYSTEM, SAHATN_ID_SYSTEM } from '../fhir.constants';
import type { PractitionerSource } from '../fhir.sources';
import type { FhirPractitioner, FhirQualification } from '../fhir.types';
import { meta } from './converter-support';

// Le convertisseur ne fait pas de switch exhaustif : la seule valeur enum
// utilisee est `verificationStatus`, mappee vers un booleen `active`, ce qui
// couvre toutes les valeurs sans perte.

// Mapping SahaTN DoctorProfile -> FHIR Practitioner (R4).
//
// Source reelle : `DoctorProfile` (id, displayName, languages, specialites
// declarees, verificationStatus). Aucun numero d'ordre professionnel reel n'est
// stocke : aucun `identifier` national n'est produit.
//
// Limites :
// - `qualification.code` : les specialites sont des LIBELLES metier non codes ;
//   ils sont exportes en `text` uniquement (aucune correspondance SNOMED
//   inventee).
// - `communication` : les langues declarees sont des codes BCP-47 ('fr','ar').
// - `active` : vrai uniquement si le profil est VERIFIED.
export function toFhirPractitioner(source: PractitionerSource): FhirPractitioner {
  const communication = source.languages
    .filter((language) => language.trim().length > 0)
    .map((language) => ({
      coding: [{ system: FHIR_SYSTEM.bcp47, code: language }]
    }));

  const qualification: FhirQualification[] = source.specialtyLabels
    .filter((label) => label.trim().length > 0)
    .map((label) => ({ code: { text: label } }));

  const practitioner: FhirPractitioner = {
    resourceType: 'Practitioner',
    id: source.id,
    meta: meta(FHIR_PROFILE.practitioner),
    identifier: [
      {
        use: 'secondary',
        system: SAHATN_ID_SYSTEM.practitioner,
        value: source.id
      }
    ],
    active: source.verificationStatus === 'VERIFIED',
    name: [{ text: source.displayName }]
  };

  if (communication.length > 0) {
    practitioner.communication = communication;
  }
  if (qualification.length > 0) {
    practitioner.qualification = qualification;
  }

  return practitioner;
}
