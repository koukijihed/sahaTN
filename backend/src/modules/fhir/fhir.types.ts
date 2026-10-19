// Types FHIR R4 (version 4.0.1) — sous-ensemble strict et volontairement
// restreint aux elements reellement produits par le prototype SahaTN.
//
// Ces types decrivent la FORME structurelle attendue. Ils ne garantissent pas,
// a eux seuls, la conformite a toutes les regles FHIR (cardinalites,
// invariants, terminologies) : une validation structurelle dediee
// (`fhir-validation.ts`) couvre un sous-ensemble de ces regles et le precise.
//
// Reference normative : https://hl7.org/fhir/R4/

export type FhirResourceType =
  | 'Patient'
  | 'Practitioner'
  | 'Organization'
  | 'Encounter'
  | 'Observation'
  | 'Condition'
  | 'AllergyIntolerance'
  | 'DocumentReference'
  | 'Provenance';

// --------------------------------------------------------------- primitives

export interface FhirMeta {
  profile?: string[];
  lastUpdated?: string;
}

export interface FhirIdentifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  system?: string;
  value: string;
}

export interface FhirReference {
  reference?: string;
  type?: string;
  display?: string;
}

export interface FhirCoding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirHumanName {
  use?: 'usual' | 'official' | 'temp' | 'nickname' | 'anonymous' | 'old' | 'maiden';
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
}

export type FhirContactPointSystem =
  | 'phone'
  | 'fax'
  | 'email'
  | 'pager'
  | 'url'
  | 'sms'
  | 'other';

export interface FhirContactPoint {
  system?: FhirContactPointSystem;
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
}

export interface FhirAddress {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  type?: 'postal' | 'physical' | 'both';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface FhirPeriod {
  start?: string;
  end?: string;
}

export interface FhirAttachment {
  contentType?: string;
  title?: string;
  size?: number;
  creation?: string;
}

export interface FhirNarrative {
  status: 'generated' | 'extensions' | 'additional' | 'empty';
  div: string;
}

// ---------------------------------------------------------------- resources

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  address?: FhirAddress[];
  managingOrganization?: FhirReference;
}

export interface FhirQualification {
  code: FhirCodeableConcept;
}

export interface FhirPractitioner {
  resourceType: 'Practitioner';
  id: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  address?: FhirAddress[];
  qualification?: FhirQualification[];
  communication?: FhirCodeableConcept[];
}

export interface FhirOrganization {
  resourceType: 'Organization';
  id: string;
  meta?: FhirMeta;
  identifier?: FhirIdentifier[];
  active?: boolean;
  name: string;
  alias?: string[];
  telecom?: FhirContactPoint[];
  address?: FhirAddress[];
}

export type FhirEncounterStatus =
  | 'planned'
  | 'arrived'
  | 'triaged'
  | 'in-progress'
  | 'onleave'
  | 'finished'
  | 'cancelled'
  | 'entered-in-error'
  | 'unknown';

export interface FhirEncounterParticipant {
  individual?: FhirReference;
}

export interface FhirEncounterLocation {
  location: FhirReference;
}

export interface FhirEncounter {
  resourceType: 'Encounter';
  id: string;
  meta?: FhirMeta;
  status: FhirEncounterStatus;
  class: FhirCoding;
  type?: FhirCodeableConcept[];
  subject?: FhirReference;
  participant?: FhirEncounterParticipant[];
  period?: FhirPeriod;
  reasonCode?: FhirCodeableConcept[];
  serviceProvider?: FhirReference;
  location?: FhirEncounterLocation[];
}

export type FhirObservationStatus =
  | 'registered'
  | 'preliminary'
  | 'final'
  | 'amended'
  | 'corrected'
  | 'cancelled'
  | 'entered-in-error'
  | 'unknown';

export interface FhirQuantity {
  value: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface FhirAnnotation {
  text: string;
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  meta?: FhirMeta;
  status: FhirObservationStatus;
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject?: FhirReference;
  encounter?: FhirReference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: FhirReference[];
  valueQuantity?: FhirQuantity;
  valueString?: string;
  valueCodeableConcept?: FhirCodeableConcept;
  dataAbsentReason?: FhirCodeableConcept;
}

export interface FhirCondition {
  resourceType: 'Condition';
  id: string;
  meta?: FhirMeta;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  code?: FhirCodeableConcept;
  subject?: FhirReference;
  encounter?: FhirReference;
  onsetDateTime?: string;
  recordedDate?: string;
  note?: FhirAnnotation[];
}

export type FhirAllergyCriticality = 'low' | 'high' | 'unable-to-assess';

export interface FhirAllergyReaction {
  manifestation: FhirCodeableConcept[];
  severity?: 'mild' | 'moderate' | 'severe';
}

export interface FhirAllergyIntolerance {
  resourceType: 'AllergyIntolerance';
  id: string;
  meta?: FhirMeta;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  type?: 'allergy' | 'intolerance';
  category?: ('food' | 'medication' | 'environment' | 'biologic')[];
  criticality?: FhirAllergyCriticality;
  code?: FhirCodeableConcept;
  patient: FhirReference;
  recordedDate?: string;
  recorder?: FhirReference;
  reaction?: FhirAllergyReaction[];
  note?: FhirAnnotation[];
}

export type FhirDocumentReferenceStatus =
  | 'current'
  | 'superseded'
  | 'entered-in-error';

export type FhirDocumentReferenceDocStatus =
  | 'preliminary'
  | 'final'
  | 'amended'
  | 'entered-in-error';

export interface FhirDocumentReferenceContent {
  attachment: FhirAttachment;
}

export interface FhirDocumentReferenceContext {
  encounter?: FhirReference[];
  period?: FhirPeriod;
}

export interface FhirDocumentReference {
  resourceType: 'DocumentReference';
  id: string;
  meta?: FhirMeta;
  masterIdentifier?: FhirIdentifier;
  status: FhirDocumentReferenceStatus;
  docStatus?: FhirDocumentReferenceDocStatus;
  type?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  subject?: FhirReference;
  date?: string;
  author?: FhirReference[];
  context?: FhirDocumentReferenceContext;
  content: FhirDocumentReferenceContent[];
}

export interface FhirProvenanceAgent {
  type?: FhirCodeableConcept;
  who: FhirReference;
}

export interface FhirProvenance {
  resourceType: 'Provenance';
  id: string;
  meta?: FhirMeta;
  target: FhirReference[];
  recorded: string;
  agent: FhirProvenanceAgent[];
}

export type FhirResource =
  | FhirPatient
  | FhirPractitioner
  | FhirOrganization
  | FhirEncounter
  | FhirObservation
  | FhirCondition
  | FhirAllergyIntolerance
  | FhirDocumentReference
  | FhirProvenance;

export type FhirBundleType =
  | 'document'
  | 'message'
  | 'transaction'
  | 'transaction-response'
  | 'batch'
  | 'batch-response'
  | 'history'
  | 'searchset'
  | 'collection';

export interface FhirBundleEntry {
  fullUrl?: string;
  resource: FhirResource;
}

export interface FhirBundle {
  resourceType: 'Bundle';
  id?: string;
  meta?: FhirMeta;
  type: FhirBundleType;
  timestamp?: string;
  total?: number;
  entry?: FhirBundleEntry[];
}
