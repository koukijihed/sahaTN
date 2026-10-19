import {
  DEFAULT_COUNTRY_CODE,
  FHIR_PROFILE,
  SAHATN_ID_SYSTEM
} from '../fhir.constants';
import type { OrganizationSource } from '../fhir.sources';
import type { FhirAddress, FhirContactPoint, FhirIdentifier, FhirOrganization } from '../fhir.types';
import { meta } from './converter-support';

// Mapping SahaTN HealthcareFacility -> FHIR Organization (R4).
//
// Source reelle : `HealthcareFacility` (displayName, officialName, adresse,
// governorate, delegation, postalCode, phone, websiteUrl, licenseReference,
// verificationStatus). La `licenseReference` est un identifiant METIER declare ;
// elle est exposee comme identifiant LOCAL SahaTN (`urn:`), jamais comme un
// identifiant national officiel.
//
// Limites :
// - `type` : aucun codage standard fiable pour les types d'etablissements
//   tunisiens : non exporte (a valider avec les autorites de sante).
export function toFhirOrganization(source: OrganizationSource): FhirOrganization {
  const telecom: FhirContactPoint[] = [];
  if (source.phone) {
    telecom.push({ system: 'phone', value: source.phone, use: 'work' });
  }
  if (source.websiteUrl) {
    telecom.push({ system: 'url', value: source.websiteUrl, use: 'work' });
  }

  const addressLines = [source.addressLine].filter((line) => line.trim().length > 0);
  const address: FhirAddress = {
    type: 'physical',
    line: addressLines,
    city: source.city,
    state: source.governorate,
    country: DEFAULT_COUNTRY_CODE
  };
  if (source.delegation) {
    address.district = source.delegation;
  }
  if (source.postalCode) {
    address.postalCode = source.postalCode;
  }

  const identifier: FhirIdentifier[] = [];
  if (source.licenseReference) {
    identifier.push({
      use: 'official',
      system: SAHATN_ID_SYSTEM.facilityLicense,
      value: source.licenseReference
    });
  }

  const organization: FhirOrganization = {
    resourceType: 'Organization',
    id: source.id,
    meta: meta(FHIR_PROFILE.organization),
    active: source.verificationStatus === 'VERIFIED',
    name: source.officialName ?? source.displayName,
    address: [address]
  };

  if (identifier.length > 0) {
    organization.identifier = identifier;
  }
  if (source.officialName && source.officialName !== source.displayName) {
    organization.alias = [source.displayName];
  }
  if (telecom.length > 0) {
    organization.telecom = telecom;
  }

  return organization;
}
