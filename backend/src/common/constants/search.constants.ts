// Constantes partagees des routes de recherche (Jour 5).
// Les langues de consultation supportees par le filtre `language`.
export const SUPPORTED_LANGUAGES = ['fr', 'ar', 'en', 'de', 'it', 'es'] as const;

// Tris autorises sur la recherche medecins.
export const DOCTOR_SORTS = ['name', 'newest'] as const;

// Tris autorises sur la recherche etablissements.
export const FACILITY_SORTS = ['name', 'newest'] as const;

// Types de recherche combinee (endpoint /api/search).
export const SEARCH_TYPES = ['all', 'doctors', 'facilities'] as const;

// Message explicite envoye quand un filtre de disponibilite est demande
// avant l'existence d'agendas fiables (Phase 3). Aucun creneau n'est simule.
export const AVAILABILITY_FILTER_MESSAGE =
  'Les filtres de disponibilite ne sont pas encore disponibles : aucun agenda ';
export const AVAILABILITY_FILTER_MESSAGE_SUFFIX =
  "fiable n'est connecte a ce stade. Aucune disponibilite reelle n'est affichee.";