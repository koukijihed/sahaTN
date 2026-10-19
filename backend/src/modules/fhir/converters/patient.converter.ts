import { FHIR_PROFILE, SAHATN_ID_SYSTEM } from '../fhir.constants';
import type { PatientSource } from '../fhir.sources';
import type { FhirContactPoint, FhirPatient } from '../fhir.types';
import { meta } from './converter-support';

// Mapping SahaTN User(patient) -> FHIR Patient (R4).
//
// Source reelle : `User` (id, status, email, phone). SahaTN ne stocke PAS de
// nom, de date de naissance, de sexe ni d'identifiant national de sante pour un
// patient : ces elements sont donc OMIS (jamais inventes).
//
// Limites :
// - `name`, `birthDate`, `gender` : absents du modele source.
// - `identifier` : aucun identifiant national fiable n'existe. On expose un
//   identifiant LOCAL SahaTN (systeme `urn:`) marque `secondary`, distinct d'un
//   identifiant national. E-mail et telephone ne servent JAMAIS d'identifiant.
// - e-mail/telephone : exportes uniquement comme `telecom` (coordonnees).
export function toFhirPatient(source: PatientSource): FhirPatient {
  const telecom: FhirContactPoint[] = [];
  if (source.email) {
    telecom.push({ system: 'email', value: source.email, use: 'home' });
  }
  if (source.phone) {
    telecom.push({ system: 'phone', value: source.phone, use: 'mobile' });
  }

  const patient: FhirPatient = {
    resourceType: 'Patient',
    id: source.id,
    meta: meta(FHIR_PROFILE.patient),
    identifier: [
      {
        use: 'secondary',
        system: SAHATN_ID_SYSTEM.patient,
        value: source.id
      }
    ],
    active: source.active
  };

  if (telecom.length > 0) {
    patient.telecom = telecom;
  }

  return patient;
}
