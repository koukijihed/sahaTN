export interface SpecialtyView {
  id: string;
  code: string;
  labelFr: string;
  labelAr: string | null;
  isPrimary: boolean;
}

export interface PracticeFacilityView {
  id: string;
  displayName: string;
  sector: string;
  type: string;
  governorate: string;
  city: string;
}

export interface DoctorPublicView {
  id: string;
  displayName: string;
  professionalDescription: string | null;
  languages: string[];
  yearsOfExperience: number | null;
  specialties: SpecialtyView[];
  practiceFacilities: PracticeFacilityView[];
}

export interface FacilityPublicView {
  id: string;
  displayName: string;
  officialName: string | null;
  description: string | null;
  sector: string;
  type: string;
  governorate: string;
  city: string;
  delegation: string | null;
  postalCode: string | null;
  addressLine: string;
  phone: string | null;
  websiteUrl: string | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface SearchResult {
  query: {
    type: string;
    q: string | undefined;
    governorate: string | undefined;
    sector: string | undefined;
    specialtyId: string | undefined;
    language: string | undefined;
  };
  doctors: Paged<DoctorPublicView> | null;
  facilities: Paged<FacilityPublicView> | null;
}

export interface SpecialtyReference {
  id: string;
  code: string;
  labelFr: string;
  labelAr: string | null;
  isActive: boolean;
}

export const GOVERNORATES = [
  'TUNIS',
  'ARIANA',
  'BEN_AROUS',
  'MANOUBA',
  'NABEUL',
  'ZAGHOUAN',
  'BIZERTE',
  'BEJA',
  'JENDOUBA',
  'KEF',
  'SILIANA',
  'SOUSSE',
  'MONASTIR',
  'MAHDIA',
  'SFAX',
  'KAIROUAN',
  'KASSERINE',
  'SIDI_BOUZID',
  'GABES',
  'MEDENINE',
  'TATAOUINE',
  'GAFSA',
  'TOZEUR',
  'KEBILI'
];

export const SECTORS = ['PUBLIC', 'PRIVATE'];

export const FACILITY_TYPES = [
  'HOSPITAL',
  'UNIVERSITY_HOSPITAL',
  'REGIONAL_HOSPITAL',
  'LOCAL_HOSPITAL',
  'BASIC_HEALTH_CENTER',
  'PRIVATE_CLINIC',
  'MEDICAL_CABINET',
  'MEDICAL_GROUP',
  'IMAGING_CENTER',
  'ANALYSIS_LABORATORY',
  'SPECIALIZED_CARE_CENTER',
  'OTHER'
];

export const SUPPORTED_LANGUAGES = ['fr', 'ar', 'en', 'de', 'it', 'es'];

export const NAME_SORTS = ['name', 'newest'];

export const SEARCH_TYPES = ['all', 'doctors', 'facilities'];

export const LANG_LABELS: Record<string, string> = {
  fr: 'Français',
  ar: 'العربية',
  en: 'English',
  de: 'Deutsch',
  it: 'Italiano',
  es: 'Español'
};