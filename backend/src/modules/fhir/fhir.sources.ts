// Types sources (SahaTN -> FHIR). Ces structures sont volontairement decouplees
// de Prisma : les convertisseurs sont purs, deterministes et testables sans base
// de donnees. Un service d'export se charge de projeter les modeles Prisma vers
// ces sources, en n'incluant que des champs reellement presents dans le schema.
//
// Chaque type source ne contient QUE des donnees existantes dans le modele
// SahaTN. Les champs absents (nom du patient, date de naissance, sexe, code
// national, code medical normalise...) ne sont PAS inventes : ils sont omis et
// documentes comme limitations.

export interface PatientSource {
  // User.id : identifiant technique interne (UUID). Jamais un identifiant
  // national de sante.
  id: string;
  active: boolean;
  // Coordonnees de contact (autorisees comme `telecom`, jamais comme
  // `identifier`).
  email: string | null;
  phone: string | null;
}

export interface PractitionerSource {
  // DoctorProfile.id
  id: string;
  displayName: string;
  // Languages declares (ex. 'fr', 'ar') : codes BCP-47.
  languages: string[];
  // Libelles metier des specialites declarees (non codes).
  specialtyLabels: string[];
  verificationStatus:
    | 'UNVERIFIED'
    | 'PENDING'
    | 'UNDER_REVIEW'
    | 'VERIFIED'
    | 'REJECTED'
    | 'NEEDS_CORRECTION'
    | 'SUSPENDED'
    | 'REVOKED';
}

export interface OrganizationSource {
  // HealthcareFacility.id
  id: string;
  displayName: string;
  officialName: string | null;
  description: string | null;
  addressLine: string;
  city: string;
  governorate: string;
  delegation: string | null;
  postalCode: string | null;
  phone: string | null;
  websiteUrl: string | null;
  // Reference de licence declaree (identifiant metier local, non national).
  licenseReference: string | null;
  verificationStatus:
    | 'DRAFT'
    | 'PENDING'
    | 'UNDER_REVIEW'
    | 'VERIFIED'
    | 'REJECTED'
    | 'NEEDS_CORRECTION'
    | 'SUSPENDED';
}

export interface EncounterSource {
  // ClinicalEncounter.id
  id: string;
  type:
    | 'CONSULTATION'
    | 'FOLLOW_UP'
    | 'TELECONSULTATION'
    | 'EMERGENCY'
    | 'OTHER';
  occurredAt: Date;
  doctorProfileId: string;
  facilityId: string | null;
  appointmentId: string | null;
  chiefComplaint: string | null;
  // `notes` n'a pas d'equivalent direct dans Encounter R4 : conserve dans la
  // source mais non exporte (voir limitations du convertisseur).
  notes: string | null;
  recordStatus: 'ACTIVE' | 'ENTERED_IN_ERROR';
}

export interface ObservationSource {
  // ClinicalObservation.id
  id: string;
  encounterId: string | null;
  category:
    | 'VITAL_SIGN'
    | 'LABORATORY'
    | 'SYMPTOM'
    | 'MEASUREMENT'
    | 'EXAM_RESULT'
    | 'OTHER';
  code: string | null;
  label: string;
  valueText: string | null;
  valueNumeric: number | null;
  unit: string | null;
  certainty: 'KNOWN' | 'UNKNOWN' | 'NEGATED';
  observedAt: Date;
  doctorProfileId: string;
  recordStatus: 'ACTIVE' | 'ENTERED_IN_ERROR';
}

export interface ConditionSource {
  // ClinicalDiagnosis.id
  id: string;
  encounterId: string | null;
  code: string | null;
  label: string;
  description: string | null;
  status: 'PROVISIONAL' | 'CONFIRMED' | 'REFUTED' | 'RESOLVED';
  diagnosedAt: Date;
  doctorProfileId: string;
  recordStatus: 'ACTIVE' | 'ENTERED_IN_ERROR';
}

export interface AllergyIntoleranceSource {
  // PatientAllergy.id
  id: string;
  allergen: string;
  reaction: string | null;
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING' | 'UNKNOWN' | null;
  source: 'PATIENT_REPORTED' | 'PROFESSIONAL_DOCUMENTED' | 'IMPORTED' | 'UNKNOWN';
  certainty: 'KNOWN' | 'UNKNOWN' | 'NEGATED';
  status: 'ACTIVE' | 'RESOLVED';
  recordedAt: Date;
  doctorProfileId: string;
  recordStatus: 'ACTIVE' | 'ENTERED_IN_ERROR';
}

export interface DocumentSource {
  // MedicalDocument.id
  id: string;
  category: 'LAB_RESULT' | 'IMAGING' | 'REPORT' | 'PRESCRIPTION' | 'OTHER';
  originalName: string;
  // Type MIME verifie du contenu (jamais le chemin de stockage).
  mimeType: string;
  sizeBytes: number;
  status: 'ACTIVE' | 'ARCHIVED';
  encounterId: string | null;
  createdAt: Date;
  uploadedByUserId: string;
  uploaderDoctorProfileId: string | null;
}

// Agregat coherent de ressources sources. Les references sont portees par les
// identifiants techniques ci-dessus.
export interface FhirExportSource {
  patient: PatientSource;
  practitioners: PractitionerSource[];
  organizations: OrganizationSource[];
  encounters: EncounterSource[];
  observations: ObservationSource[];
  conditions: ConditionSource[];
  allergies: AllergyIntoleranceSource[];
  documents: DocumentSource[];
}
