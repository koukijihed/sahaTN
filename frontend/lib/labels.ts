// Libelles d'affichage bilingues (francais / arabe) pour les referentiels.
//
// Les cles suivent exactement les enumerations du backend (voir
// docs/reference-data.md). Les tables sont typees sur des unions litterales :
// si une valeur d'enumeration venait a etre ajoutee ou renommee sans mettre a
// jour les libelles, la compilation TypeScript echouerait (garantie de
// completude, verifiee par `npm run typecheck`).
//
// Le francais reste la locale par defaut afin de ne rien changer au
// comportement existant ; l'arabe est expose pour une future interface
// localisee (y compris l'affichage de droite a gauche, non encore active).

export type Locale = 'fr' | 'ar';

export const SUPPORTED_LOCALES: readonly Locale[] = ['fr', 'ar'] as const;

export const DEFAULT_LOCALE: Locale = 'fr';

type Governorate =
  | 'TUNIS'
  | 'ARIANA'
  | 'BEN_AROUS'
  | 'MANOUBA'
  | 'NABEUL'
  | 'ZAGHOUAN'
  | 'BIZERTE'
  | 'BEJA'
  | 'JENDOUBA'
  | 'KEF'
  | 'SILIANA'
  | 'SOUSSE'
  | 'MONASTIR'
  | 'MAHDIA'
  | 'SFAX'
  | 'KAIROUAN'
  | 'KASSERINE'
  | 'SIDI_BOUZID'
  | 'GABES'
  | 'MEDENINE'
  | 'TATAOUINE'
  | 'GAFSA'
  | 'TOZEUR'
  | 'KEBILI';

type FacilityType =
  | 'HOSPITAL'
  | 'UNIVERSITY_HOSPITAL'
  | 'REGIONAL_HOSPITAL'
  | 'LOCAL_HOSPITAL'
  | 'BASIC_HEALTH_CENTER'
  | 'PRIVATE_CLINIC'
  | 'MEDICAL_CABINET'
  | 'MEDICAL_GROUP'
  | 'IMAGING_CENTER'
  | 'ANALYSIS_LABORATORY'
  | 'SPECIALIZED_CARE_CENTER'
  | 'OTHER';

type Sector = 'PUBLIC' | 'PRIVATE';

const SECTOR_LABELS_FR: Record<Sector, string> = {
  PUBLIC: 'Public',
  PRIVATE: 'Privé'
};

const SECTOR_LABELS_AR: Record<Sector, string> = {
  PUBLIC: 'عام',
  PRIVATE: 'خاص'
};

const FACILITY_TYPE_LABELS_FR: Record<FacilityType, string> = {
  HOSPITAL: 'Hôpital',
  UNIVERSITY_HOSPITAL: 'Hôpital universitaire',
  REGIONAL_HOSPITAL: 'Hôpital régional',
  LOCAL_HOSPITAL: 'Hôpital local',
  BASIC_HEALTH_CENTER: 'Centre de santé de base',
  PRIVATE_CLINIC: 'Clinique privée',
  MEDICAL_CABINET: 'Cabinet médical',
  MEDICAL_GROUP: 'Groupe médical',
  IMAGING_CENTER: 'Centre d’imagerie',
  ANALYSIS_LABORATORY: 'Laboratoire d’analyses',
  SPECIALIZED_CARE_CENTER: 'Centre de soins spécialisés',
  OTHER: 'Autre'
};

const FACILITY_TYPE_LABELS_AR: Record<FacilityType, string> = {
  HOSPITAL: 'مستشفى',
  UNIVERSITY_HOSPITAL: 'مستشفى جامعي',
  REGIONAL_HOSPITAL: 'مستشفى جهوي',
  LOCAL_HOSPITAL: 'مستشفى محلي',
  BASIC_HEALTH_CENTER: 'مركز صحة أساسية',
  PRIVATE_CLINIC: 'مصحة خاصة',
  MEDICAL_CABINET: 'عيادة طبية',
  MEDICAL_GROUP: 'مجمع طبي',
  IMAGING_CENTER: 'مركز تصوير طبي',
  ANALYSIS_LABORATORY: 'مخبر تحاليل',
  SPECIALIZED_CARE_CENTER: 'مركز رعاية متخصصة',
  OTHER: 'أخرى'
};

const GOVERNORATE_LABELS_FR: Record<Governorate, string> = {
  TUNIS: 'Tunis',
  ARIANA: 'Ariana',
  BEN_AROUS: 'Ben Arous',
  MANOUBA: 'La Manouba',
  NABEUL: 'Nabeul',
  ZAGHOUAN: 'Zaghouan',
  BIZERTE: 'Bizerte',
  BEJA: 'Béja',
  JENDOUBA: 'Jendouba',
  KEF: 'Le Kef',
  SILIANA: 'Siliana',
  SOUSSE: 'Sousse',
  MONASTIR: 'Monastir',
  MAHDIA: 'Mahdia',
  SFAX: 'Sfax',
  KAIROUAN: 'Kairouan',
  KASSERINE: 'Kasserine',
  SIDI_BOUZID: 'Sidi Bouzid',
  GABES: 'Gabès',
  MEDENINE: 'Médenine',
  TATAOUINE: 'Tataouine',
  GAFSA: 'Gafsa',
  TOZEUR: 'Tozeur',
  KEBILI: 'Kébili'
};

const GOVERNORATE_LABELS_AR: Record<Governorate, string> = {
  TUNIS: 'تونس',
  ARIANA: 'أريانة',
  BEN_AROUS: 'بن عروس',
  MANOUBA: 'منوبة',
  NABEUL: 'نابل',
  ZAGHOUAN: 'زغوان',
  BIZERTE: 'بنزرت',
  BEJA: 'باجة',
  JENDOUBA: 'جندوبة',
  KEF: 'الكاف',
  SILIANA: 'سليانة',
  SOUSSE: 'سوسة',
  MONASTIR: 'المنستير',
  MAHDIA: 'المهدية',
  SFAX: 'صفاقس',
  KAIROUAN: 'القيروان',
  KASSERINE: 'القصرين',
  SIDI_BOUZID: 'سيدي بوزيد',
  GABES: 'قابس',
  MEDENINE: 'مدنين',
  TATAOUINE: 'تطاوين',
  GAFSA: 'قفصة',
  TOZEUR: 'توزر',
  KEBILI: 'قبلي'
};

// Vues indexables au runtime (les cles proviennent de l'API sous forme de
// `string`), tout en conservant la garantie de completude ci-dessus.
export const SECTOR_LABELS: Record<string, string> = SECTOR_LABELS_FR;
export const FACILITY_TYPE_LABELS: Record<string, string> = FACILITY_TYPE_LABELS_FR;
export const GOVERNORATE_LABELS: Record<string, string> = GOVERNORATE_LABELS_FR;

export const SECTOR_LABELS_BY_LOCALE: Record<Locale, Record<string, string>> = {
  fr: SECTOR_LABELS_FR,
  ar: SECTOR_LABELS_AR
};

export const FACILITY_TYPE_LABELS_BY_LOCALE: Record<
  Locale,
  Record<string, string>
> = {
  fr: FACILITY_TYPE_LABELS_FR,
  ar: FACILITY_TYPE_LABELS_AR
};

export const GOVERNORATE_LABELS_BY_LOCALE: Record<
  Locale,
  Record<string, string>
> = {
  fr: GOVERNORATE_LABELS_FR,
  ar: GOVERNORATE_LABELS_AR
};

function fallback(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function lookup(
  tables: Record<Locale, Record<string, string>>,
  value: string,
  locale: Locale
): string {
  return tables[locale][value] ?? fallback(value);
}

export function sectorLabel(sector: string, locale: Locale = DEFAULT_LOCALE): string {
  return lookup(SECTOR_LABELS_BY_LOCALE, sector, locale);
}

export function facilityTypeLabel(
  type: string,
  locale: Locale = DEFAULT_LOCALE
): string {
  return lookup(FACILITY_TYPE_LABELS_BY_LOCALE, type, locale);
}

export function governorateLabel(
  governorate: string,
  locale: Locale = DEFAULT_LOCALE
): string {
  return lookup(GOVERNORATE_LABELS_BY_LOCALE, governorate, locale);
}

// Les specialites proviennent de l'API (`labelFr` / `labelAr`). En arabe, on
// retombe sur le libelle francais si la traduction est absente.
export function specialtyLabel(
  specialty: { labelFr: string; labelAr?: string | null },
  locale: Locale = DEFAULT_LOCALE
): string {
  if (locale === 'ar' && specialty.labelAr) {
    return specialty.labelAr;
  }
  return specialty.labelFr;
}
