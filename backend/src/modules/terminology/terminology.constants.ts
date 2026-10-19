import { ClinicalObservationCategory } from '@prisma/client';

// Referentiel de terminologie INTERNE a SahaTN.
//
// Important : ces codes ne proviennent d'aucune nomenclature externe. Les
// terminologies internationales (CIM/ICD, LOINC, SNOMED CT) ne sont
// volontairement PAS reproduites ici : leur usage est soumis a des licences et
// a une verification de source (voir docs/reference-data.md). Les codes
// ci-dessous appartiennent a l'espace de noms interne SahaTN et peuvent evoluer
// par decision produit documentee.
//
// Les unites suivent la syntaxe UCUM (Unified Code for Units of Measure), dont
// la specification est publiquement disponible (https://ucum.org). Seul un
// sous-ensemble utile aux signes vitaux est expose.

export const TERMINOLOGY_VERSION = '1.0.0';

export const SAHATN_TERMINOLOGY_SYSTEM =
  'https://sahatn.example/tn/terminology/observation';

export interface UnitDefinition {
  code: string;
  labelFr: string;
  labelAr: string;
}

export interface ObservationDefinition {
  code: string;
  category: ClinicalObservationCategory;
  labelFr: string;
  labelAr: string;
  unit: string;
}

// Sous-ensemble UCUM. Le code est la chaine UCUM exacte (ex. `mm[Hg]`).
export const UCUM_UNITS: readonly UnitDefinition[] = [
  { code: 'mm[Hg]', labelFr: 'millimètre de mercure', labelAr: 'مليمتر زئبقي' },
  { code: '/min', labelFr: 'par minute', labelAr: 'في الدقيقة' },
  { code: 'Cel', labelFr: 'degré Celsius', labelAr: 'درجة مئوية' },
  { code: '%', labelFr: 'pour cent', labelAr: 'بالمائة' },
  { code: 'kg', labelFr: 'kilogramme', labelAr: 'كيلوغرام' },
  { code: 'cm', labelFr: 'centimètre', labelAr: 'سنتيمتر' },
  { code: 'kg/m2', labelFr: 'kilogramme par mètre carré', labelAr: 'كيلوغرام لكل متر مربع' }
];

const VITAL_SIGN = ClinicalObservationCategory.VITAL_SIGN;

// Signes vitaux standard. Codes internes, libelles bilingues a valider par un
// referentiel clinique avant usage en production.
export const VITAL_SIGNS: readonly ObservationDefinition[] = [
  {
    code: 'VITAL_SYSTOLIC_BP',
    category: VITAL_SIGN,
    labelFr: 'Tension artérielle systolique',
    labelAr: 'ضغط الدم الانقباضي',
    unit: 'mm[Hg]'
  },
  {
    code: 'VITAL_DIASTOLIC_BP',
    category: VITAL_SIGN,
    labelFr: 'Tension artérielle diastolique',
    labelAr: 'ضغط الدم الانبساطي',
    unit: 'mm[Hg]'
  },
  {
    code: 'VITAL_HEART_RATE',
    category: VITAL_SIGN,
    labelFr: 'Fréquence cardiaque',
    labelAr: 'معدل نبض القلب',
    unit: '/min'
  },
  {
    code: 'VITAL_RESPIRATORY_RATE',
    category: VITAL_SIGN,
    labelFr: 'Fréquence respiratoire',
    labelAr: 'معدل التنفس',
    unit: '/min'
  },
  {
    code: 'VITAL_BODY_TEMPERATURE',
    category: VITAL_SIGN,
    labelFr: 'Température corporelle',
    labelAr: 'حرارة الجسم',
    unit: 'Cel'
  },
  {
    code: 'VITAL_OXYGEN_SATURATION',
    category: VITAL_SIGN,
    labelFr: 'Saturation en oxygène (SpO2)',
    labelAr: 'تشبع الأكسجين في الدم (SpO2)',
    unit: '%'
  },
  {
    code: 'VITAL_BODY_WEIGHT',
    category: VITAL_SIGN,
    labelFr: 'Poids corporel',
    labelAr: 'وزن الجسم',
    unit: 'kg'
  },
  {
    code: 'VITAL_BODY_HEIGHT',
    category: VITAL_SIGN,
    labelFr: 'Taille corporelle',
    labelAr: 'طول الجسم',
    unit: 'cm'
  },
  {
    code: 'VITAL_BODY_MASS_INDEX',
    category: VITAL_SIGN,
    labelFr: 'Indice de masse corporelle (IMC)',
    labelAr: 'مؤشر كتلة الجسم',
    unit: 'kg/m2'
  }
];

export const OBSERVATION_CATALOGUE: readonly ObservationDefinition[] = [
  ...VITAL_SIGNS
];

export function isKnownUnit(code: string): boolean {
  return UCUM_UNITS.some((unit) => unit.code === code);
}

export function isKnownVitalSignCode(code: string): boolean {
  return VITAL_SIGNS.some((entry) => entry.code === code);
}
