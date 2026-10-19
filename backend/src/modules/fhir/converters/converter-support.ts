import type { FhirMeta, FhirReference } from '../fhir.types';
import { FHIR_R4_VERSION } from '../fhir.constants';

// Erreur levee lorsqu'une valeur source n'a pas de correspondance FHIR fiable.
// Le but est de REFUSER explicitement plutot que de produire une ressource
// silencieusement incorrecte ou inventeé.
export class UnsupportedFhirMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedFhirMappingError';
  }
}

// Garde d'exhaustivite : compile-time et runtime. Toute valeur d'enum non
// couverte par un mapping doit faire echouer l'export.
export function assertNever(value: never, context: string): never {
  throw new UnsupportedFhirMappingError(
    `Unsupported ${context} value: ${String(value)}`
  );
}

// Reference logique relative `<Type>/<id>`, coherente entre ressources.
export function reference(type: string, id: string, display?: string): FhirReference {
  const ref: FhirReference = { reference: `${type}/${id}` };
  if (display) {
    ref.display = display;
  }
  return ref;
}

// Instant ISO 8601 en UTC. Les dates sources sont des `Date` (instants),
// stockees en UTC : on ne reinterprette jamais une date locale comme un instant
// UTC. La sortie se termine donc par 'Z'.
export function toInstant(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new UnsupportedFhirMappingError('Invalid date value for FHIR instant');
  }
  return date.toISOString();
}

export function meta(profile: string): FhirMeta {
  return { profile: [profile] };
}

// Table de correspondance exhaustive. Refuse a l'execution toute valeur non
// couverte (utile lorsque des donnees proviennent de sources non typees).
export function lookup<T extends string, R>(
  table: Record<T, R>,
  key: T,
  context: string
): R {
  const value = table[key];
  if (value === undefined) {
    throw new UnsupportedFhirMappingError(
      `Unsupported ${context} value: ${String(key)}`
    );
  }
  return value;
}

export const FHIR_VERSION = FHIR_R4_VERSION;
