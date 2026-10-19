// Validation STRUCTURELLE INDEPENDANTE contre le schema JSON officiel de
// HL7 FHIR R4 (4.0.1) : https://hl7.org/fhir/R4/fhir.schema.json.
//
// Le schema est archive (empreinte SHA-256 verifiee) dans
// `test/fixtures/fhir-r4/fhir.schema.json` ; voir `PROVENANCE.md`.
//
// Portee : le schema verifie la FORME (types, cardinalites declarees) et
// N'ASSURE PAS la conformite a un profil d'interoperabilite (extensions,
// terminologies, contraintes nationales). C'est pourquoi il complete, sans le
// remplacer, le validateur de regles SahaTN (`fhir-validation.ts`).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { FhirValidationIssue } from './fhir-validation';

export const FHIR_R4_SCHEMA_VERSION = '4.0.1';
export const FHIR_R4_SCHEMA_URL = 'https://hl7.org/fhir/R4/fhir.schema.json';
export const FHIR_R4_SCHEMA_SHA256 =
  '2230406893b4cf002a4ee1e5e2bbeca22ac5d2d4931b3e9ef7b9594bbc376a01';

export const FHIR_R4_SCHEMA_PATH =
  process.env.FHIR_R4_SCHEMA_PATH ??
  join(process.cwd(), 'test', 'fixtures', 'fhir-r4', 'fhir.schema.json');

// Levee lorsqu'aucun schema n'est disponible localement (validation impossible).
export class FhirSchemaUnavailableError extends Error {
  constructor(path: string) {
    super(
      `FHIR R4 JSON schema unavailable at ${path}. Run "node scripts/fetch-fhir-schema.mjs" to (re)download it.`
    );
    this.name = 'FhirSchemaUnavailableError';
  }
}

let compiled: ValidateFunction | null = null;

export function isFhirSchemaAvailable(): boolean {
  return existsSync(FHIR_R4_SCHEMA_PATH);
}

function compiler(): ValidateFunction {
  if (compiled) {
    return compiled;
  }
  if (!isFhirSchemaAvailable()) {
    throw new FhirSchemaUnavailableError(FHIR_R4_SCHEMA_PATH);
  }
  const schema = JSON.parse(readFileSync(FHIR_R4_SCHEMA_PATH, 'utf8')) as {
    $schema: string;
    definitions: Record<string, unknown>;
  };
  // Le fichier publie declare draft-06 ; ajv 8 ne le supporte pas nativement.
  // draft-06 et draft-07 sont compatibles pour les mots-cles utilises ici.
  schema.$schema = 'http://json-schema.org/draft-07/schema#';
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  addFormats(ajv);
  compiled = ajv.compile({
    $ref: '#/definitions/Bundle',
    definitions: schema.definitions
  });
  return compiled;
}

function toIssue(error: ErrorObject): FhirValidationIssue {
  return {
    path: `$${error.instancePath}`,
    message: `${error.message ?? 'schema validation error'} (${error.keyword})`,
    severity: 'error',
    kind: 'fhir-conformance'
  };
}

// Valide un Bundle contre le schema officiel. Retourne une liste vide si le
// Bundle est structurellement conforme. Leve une erreur si le schema est absent.
export function validateFhirBundleAgainstSchema(
  bundle: unknown
): FhirValidationIssue[] {
  const validate = compiler();
  if (validate(bundle)) {
    return [];
  }
  return (validate.errors ?? []).map(toIssue);
}
