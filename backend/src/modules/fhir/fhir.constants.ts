// Constantes FHIR R4 (4.0.1) et conventions de terminologie du prototype SahaTN.
//
// Toutes les references de CodeSystem/ValueSet ci-dessous pointent vers des
// terminologies HL7 publiees. Aucune terminologie tunisienne officielle n'est
// inventee : les identifiants purement locaux a SahaTN utilisent un systeme
// `urn:` afin de ne jamais se presenter comme un registre national.

// Version FHIR ciblee, explicite et unique pour ce prototype.
export const FHIR_R4_VERSION = '4.0.1';
export const FHIR_R4_BASE = 'https://hl7.org/fhir/R4';

// Systemes de terminologie standards utilises (references verifiables).
export const FHIR_SYSTEM = {
  v3ActCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  observationCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  observationStatus: 'http://hl7.org/fhir/observation-status',
  dataAbsentReason: 'http://terminology.hl7.org/CodeSystem/data-absent-reason',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionVerStatus: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  allergyClinical:
    'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  allergyVerification:
    'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
  provenanceParticipantType:
    'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
  bcp47: 'urn:ietf:bcp:47'
} as const;

// Systemes d'identifiants LOCAUX a SahaTN. Le prefixe `urn:` signale
// explicitement qu'il ne s'agit PAS d'un identifiant national de sante.
export const SAHATN_ID_SYSTEM = {
  patient: 'urn:sahatn:identifier:patient',
  practitioner: 'urn:sahatn:identifier:practitioner',
  facilityLicense: 'urn:sahatn:identifier:facility-license',
  document: 'urn:sahatn:identifier:document'
} as const;

// Profils structurels declaratifs (non contraignants) references dans meta.
export const FHIR_PROFILE = {
  patient: `${FHIR_R4_BASE}/Patient`,
  practitioner: `${FHIR_R4_BASE}/Practitioner`,
  organization: `${FHIR_R4_BASE}/Organization`,
  encounter: `${FHIR_R4_BASE}/Encounter`,
  observation: `${FHIR_R4_BASE}/Observation`,
  condition: `${FHIR_R4_BASE}/Condition`,
  allergyIntolerance: `${FHIR_R4_BASE}/AllergyIntolerance`,
  documentReference: `${FHIR_R4_BASE}/DocumentReference`,
  provenance: `${FHIR_R4_BASE}/Provenance`
} as const;

// Type de Bundle utilise pour un export de dossier (pas de Composition).
export const FHIR_EXPORT_BUNDLE_TYPE = 'collection' as const;

// Pays par defaut du prototype (code ISO 3166-1 alpha-2 : Tunisie).
export const DEFAULT_COUNTRY_CODE = 'TN';
