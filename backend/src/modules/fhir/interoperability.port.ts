import type { FhirBundle } from './fhir.types';
import type { FhirExportSource } from './fhir.sources';

// Jeton d'injection de l'adaptateur d'interoperabilite. Le module FHIR depend de
// cette interface, jamais d'une implementation concrete : un connecteur
// institutionnel autorise pourra etre ajoute ulterieurement (autre adaptateur)
// sans modifier le reste de l'application.
export const INTEROPERABILITY_ADAPTER = 'INTEROPERABILITY_ADAPTER';

export interface BundleBuildOptions {
  // Horodatage du Bundle. Deterministe si fourni (exports de demonstration).
  generatedAt?: Date;
  // Identifiant logique du Bundle (optionnel).
  id?: string;
}

// Contrat d'adaptateur d'interoperabilite. Un adaptateur transforme un agregat
// source SahaTN en un artefact d'echange (ici : un Bundle FHIR R4). Il ne
// realise AUCUNE entree/sortie reseau, ne gere aucun identifiant institutionnel
// et ne contourne jamais les autorisations.
export interface InteroperabilityAdapter {
  readonly id: string;
  readonly fhirVersion: string;
  buildBundle(source: FhirExportSource, options?: BundleBuildOptions): FhirBundle;
}
