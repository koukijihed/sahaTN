// Validation STRUCTURELLE et de REGLES d'un sous-ensemble FHIR R4 cote SahaTN.
//
// Deux familles de controles sont distinguées :
// - `fhir-conformance` : regles de forme du standard (types, champs requis du
//   sous-ensemble, enums, formats, integrite des references). Un Bundle qui
//   viole ces regles est structurellement invalide.
// - `sahatn-rule` : regles propres a SahaTN (minimisation, pas de secret ni de
//   chemin de stockage, identifiants locaux, pas d'`AuditEvent` fabrique...).
//
// Cette validation N'EST PAS un validateur FHIR complet : elle ne garantit pas,
// a elle seule, la conformite a un profil d'interoperabilite. Une validation
// independante contre le schema officiel HL7 R4 est fournie separement
// (`fhir-schema-validation.ts`).
//
// Les avertissements (`warning`) sont optionnels (voir `includeWarnings`) : par
// defaut, seules les erreurs sont retournees.

export type FhirIssueSeverity = 'error' | 'warning';
export type FhirIssueKind = 'fhir-conformance' | 'sahatn-rule';

export interface FhirValidationIssue {
  path: string;
  message: string;
  severity: FhirIssueSeverity;
  kind: FhirIssueKind;
}

export interface FhirValidationOptions {
  // Inclut les avertissements (champs optionnels non renseignes, etc.).
  includeWarnings?: boolean;
}

const SUPPORTED_RESOURCE_TYPES = new Set([
  'Patient',
  'Practitioner',
  'Organization',
  'Encounter',
  'Observation',
  'Condition',
  'AllergyIntolerance',
  'DocumentReference',
  'Provenance'
]);

const SUPPORTED_BUNDLE_TYPES = new Set([
  'document',
  'message',
  'transaction',
  'transaction-response',
  'batch',
  'batch-response',
  'history',
  'searchset',
  'collection'
]);

const ID_PATTERN = /^[A-Za-z0-9\-.]{1,64}$/;
const REFERENCE_PATTERN = /^[A-Za-z]+\/[A-Za-z0-9\-.]{1,64}$/;
const SAHATN_ID_SYSTEM_PREFIX = 'urn:sahatn:identifier:';

const FORBIDDEN_KEYS = new Set([
  'storagekey',
  'passwordhash',
  'tokenhash',
  'sessionid',
  'csrftoken',
  'password',
  'secret'
]);

const FORBIDDEN_VALUE_FRAGMENTS = ['private-documents', 'storage/private'];

const OBSERVATION_STATUS = new Set([
  'registered',
  'preliminary',
  'final',
  'amended',
  'corrected',
  'cancelled',
  'entered-in-error',
  'unknown'
]);

const ENCOUNTER_STATUS = new Set([
  'planned',
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
  'cancelled',
  'entered-in-error',
  'unknown'
]);

const DOCUMENT_STATUS = new Set(['current', 'superseded', 'entered-in-error']);

interface Context {
  issues: FhirValidationIssue[];
  known: Set<string>;
  includeWarnings: boolean;
}

function error(
  ctx: Context,
  path: string,
  message: string,
  kind: FhirIssueKind = 'fhir-conformance'
): void {
  ctx.issues.push({ path, message, severity: 'error', kind });
}

function warning(
  ctx: Context,
  path: string,
  message: string,
  kind: FhirIssueKind = 'sahatn-rule'
): void {
  if (ctx.includeWarnings) {
    ctx.issues.push({ path, message, severity: 'warning', kind });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function visitForbiddenKeys(
  value: unknown,
  path: string,
  ctx: Context,
  visited: Set<object>
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      visitForbiddenKeys(item, `${path}[${index}]`, ctx, visited)
    );
    return;
  }
  if (!isObject(value)) {
    if (typeof value === 'string') {
      for (const fragment of FORBIDDEN_VALUE_FRAGMENTS) {
        if (value.toLowerCase().includes(fragment)) {
          error(
            ctx,
            path,
            `String value contains forbidden fragment "${fragment}"`,
            'sahatn-rule'
          );
        }
      }
    }
    return;
  }
  if (visited.has(value)) {
    return;
  }
  visited.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) {
      error(ctx, `${path}.${key}`, `Forbidden field "${key}"`, 'sahatn-rule');
    }
    visitForbiddenKeys(child, `${path}.${key}`, ctx, visited);
  }
}

function checkReference(
  value: unknown,
  path: string,
  ctx: Context
): void {
  if (value === undefined) {
    return;
  }
  if (!isObject(value)) {
    error(ctx, path, 'Reference must be an object');
    return;
  }
  const ref = asString(value.reference);
  if (!ref) {
    error(ctx, path, 'Reference.reference is required');
    return;
  }
  if (!REFERENCE_PATTERN.test(ref)) {
    error(ctx, path, `Malformed reference "${ref}"`);
    return;
  }
  if (!ctx.known.has(ref)) {
    error(ctx, path, `Reference "${ref}" has no matching resource`);
  }
}

function checkReferencesArray(
  value: unknown,
  path: string,
  ctx: Context,
  options: { required?: boolean } = {}
): void {
  if (value === undefined) {
    if (options.required) {
      error(ctx, path, 'At least one reference is required');
    }
    return;
  }
  if (!Array.isArray(value)) {
    error(ctx, path, 'Expected an array of references');
    return;
  }
  if (options.required && value.length === 0) {
    error(ctx, path, 'At least one reference is required');
    return;
  }
  value.forEach((item, index) => checkReference(item, `${path}[${index}]`, ctx));
}

function checkDateTime(
  value: unknown,
  path: string,
  ctx: Context
): void {
  const text = asString(value);
  if (text === null) {
    error(ctx, path, 'Expected an ISO date-time string');
    return;
  }
  if (Number.isNaN(Date.parse(text))) {
    error(ctx, path, `Invalid date-time "${text}"`);
    return;
  }
  // SahaTN exporte des instants UTC : la sortie doit se terminer par 'Z'.
  if (!text.endsWith('Z')) {
    warning(ctx, path, `Timestamp "${text}" is not in UTC (missing 'Z')`);
  }
}

function checkIdentifierArray(
  value: unknown,
  path: string,
  ctx: Context
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    error(ctx, path, 'identifier must be an array');
    return;
  }
  value.forEach((entry, index) => {
    const entryPath = `${path}[${index}]`;
    if (!isObject(entry)) {
      error(ctx, entryPath, 'identifier must be an object');
      return;
    }
    const identifierValue = asString(entry.value);
    if (!identifierValue) {
      error(ctx, `${entryPath}.value`, 'identifier.value is required');
    } else {
      if (identifierValue.includes('@')) {
        error(
          ctx,
          `${entryPath}.value`,
          'identifier.value must not be a contact (email)',
          'sahatn-rule'
        );
      }
      if (/^\+?\d[\d\s.-]{6,}$/.test(identifierValue)) {
        warning(
          ctx,
          `${entryPath}.value`,
          'identifier.value looks like a phone number'
        );
      }
    }
    const system = asString(entry.system);
    if (!system) {
      warning(ctx, `${entryPath}.system`, 'identifier.system is missing');
    } else if (!system.startsWith(SAHATN_ID_SYSTEM_PREFIX)) {
      warning(
        ctx,
        `${entryPath}.system`,
        `identifier.system "${system}" is not a SahaTN local identifier system`
      );
    }
  });
}

function checkMetaProfile(
  resource: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  const metaValue = resource.meta;
  if (!isObject(metaValue) || !Array.isArray(metaValue.profile) || metaValue.profile.length === 0) {
    warning(ctx, `${path}.meta.profile`, 'Resource has no meta.profile');
  }
}

function validateResourceShape(
  resource: Record<string, unknown>,
  path: string,
  ctx: Context
): void {
  const type = resource.resourceType;
  if (typeof type !== 'string' || !SUPPORTED_RESOURCE_TYPES.has(type)) {
    error(ctx, `${path}.resourceType`, `Unsupported resource type "${String(type)}"`);
    return;
  }
  const id = asString(resource.id);
  if (!id) {
    error(ctx, `${path}.id`, 'Resource id is required');
  } else if (!ID_PATTERN.test(id)) {
    error(ctx, `${path}.id`, `Invalid resource id "${id}"`);
  }

  checkMetaProfile(resource, path, ctx);

  switch (type) {
    case 'Patient': {
      checkIdentifierArray(resource.identifier, `${path}.identifier`, ctx);
      if (resource.name === undefined) {
        warning(ctx, `${path}.name`, 'Patient has no name (identity not conveyable)');
      }
      break;
    }
    case 'Practitioner': {
      checkIdentifierArray(resource.identifier, `${path}.identifier`, ctx);
      break;
    }
    case 'Organization': {
      const name = asString(resource.name);
      if (!name) {
        error(ctx, `${path}.name`, 'Organization.name is required');
      }
      checkIdentifierArray(resource.identifier, `${path}.identifier`, ctx);
      break;
    }
    case 'Encounter': {
      const status = asString(resource.status);
      if (!status || !ENCOUNTER_STATUS.has(status)) {
        error(ctx, `${path}.status`, `Invalid Encounter.status "${status}"`);
      }
      if (!isObject(resource.class) || !asString((resource.class as Record<string, unknown>).code)) {
        error(ctx, `${path}.class`, 'Encounter.class.code is required');
      }
      checkReference(resource.subject, `${path}.subject`, ctx);
      checkReference(resource.serviceProvider, `${path}.serviceProvider`, ctx);
      if (resource.participant !== undefined && Array.isArray(resource.participant)) {
        resource.participant.forEach((participant, index) => {
          if (isObject(participant)) {
            checkReference(
              participant.individual,
              `${path}.participant[${index}].individual`,
              ctx
            );
          }
        });
      }
      if (isObject(resource.period) && resource.period.start !== undefined) {
        checkDateTime(resource.period.start, `${path}.period.start`, ctx);
      }
      break;
    }
    case 'Observation': {
      const status = asString(resource.status);
      if (!status || !OBSERVATION_STATUS.has(status)) {
        error(ctx, `${path}.status`, `Invalid Observation.status "${status}"`);
      }
      if (!isObject(resource.code) || !asString((resource.code as Record<string, unknown>).text)) {
        error(ctx, `${path}.code`, 'Observation.code.text is required');
      }
      checkReference(resource.subject, `${path}.subject`, ctx);
      checkReference(resource.encounter, `${path}.encounter`, ctx);
      checkReferencesArray(resource.performer, `${path}.performer`, ctx);
      if (resource.effectiveDateTime !== undefined) {
        checkDateTime(resource.effectiveDateTime, `${path}.effectiveDateTime`, ctx);
      } else {
        warning(ctx, `${path}.effectiveDateTime`, 'Observation has no effectiveDateTime');
      }
      break;
    }
    case 'Condition': {
      checkReference(resource.subject, `${path}.subject`, ctx);
      checkReference(resource.encounter, `${path}.encounter`, ctx);
      if (resource.onsetDateTime !== undefined) {
        checkDateTime(resource.onsetDateTime, `${path}.onsetDateTime`, ctx);
      }
      if (resource.recordedDate !== undefined) {
        checkDateTime(resource.recordedDate, `${path}.recordedDate`, ctx);
      }
      if (!isObject(resource.clinicalStatus)) {
        warning(ctx, `${path}.clinicalStatus`, 'Condition has no clinicalStatus');
      }
      break;
    }
    case 'AllergyIntolerance': {
      checkReference(resource.patient, `${path}.patient`, ctx);
      checkReference(resource.recorder, `${path}.recorder`, ctx);
      if (resource.recordedDate !== undefined) {
        checkDateTime(resource.recordedDate, `${path}.recordedDate`, ctx);
      }
      if (!isObject(resource.clinicalStatus)) {
        warning(ctx, `${path}.clinicalStatus`, 'AllergyIntolerance has no clinicalStatus');
      }
      break;
    }
    case 'DocumentReference': {
      const status = asString(resource.status);
      if (!status || !DOCUMENT_STATUS.has(status)) {
        error(ctx, `${path}.status`, `Invalid DocumentReference.status "${status}"`);
      }
      if (!Array.isArray(resource.content) || resource.content.length === 0) {
        error(ctx, `${path}.content`, 'DocumentReference.content is required');
      } else {
        resource.content.forEach((entry, index) => {
          if (!isObject(entry) || !isObject(entry.attachment)) {
            error(ctx, `${path}.content[${index}].attachment`, 'attachment is required');
            return;
          }
          const attachment = entry.attachment as Record<string, unknown>;
          if (attachment.url !== undefined) {
            error(
              ctx,
              `${path}.content[${index}].attachment.url`,
              'Attachment.url is not allowed (no public download URL)',
              'sahatn-rule'
            );
          }
          if (attachment.data !== undefined) {
            error(
              ctx,
              `${path}.content[${index}].attachment.data`,
              'Attachment.data is not allowed (no binary content)',
              'sahatn-rule'
            );
          }
          if (attachment.contentType === undefined) {
            warning(
              ctx,
              `${path}.content[${index}].attachment.contentType`,
              'attachment.contentType is missing'
            );
          }
          if (attachment.creation !== undefined) {
            checkDateTime(
              attachment.creation,
              `${path}.content[${index}].attachment.creation`,
              ctx
            );
          }
        });
      }
      checkReference(resource.subject, `${path}.subject`, ctx);
      checkReferencesArray(resource.author, `${path}.author`, ctx);
      if (isObject(resource.context)) {
        checkReferencesArray(
          (resource.context as Record<string, unknown>).encounter,
          `${path}.context.encounter`,
          ctx
        );
      }
      if (resource.date !== undefined) {
        checkDateTime(resource.date, `${path}.date`, ctx);
      }
      break;
    }
    case 'Provenance': {
      checkReferencesArray(resource.target, `${path}.target`, ctx, { required: true });
      if (resource.recorded === undefined) {
        error(ctx, `${path}.recorded`, 'Provenance.recorded is required');
      } else {
        checkDateTime(resource.recorded, `${path}.recorded`, ctx);
      }
      if (!Array.isArray(resource.agent) || resource.agent.length === 0) {
        error(ctx, `${path}.agent`, 'Provenance.agent is required');
      } else {
        resource.agent.forEach((agent, index) => {
          if (isObject(agent)) {
            checkReference(agent.who, `${path}.agent[${index}].who`, ctx);
          }
        });
      }
      break;
    }
    default:
      error(ctx, `${path}.resourceType`, `Unsupported resource type "${String(type)}"`);
  }
}

export function validateFhirBundle(
  bundle: unknown,
  options: FhirValidationOptions = {}
): FhirValidationIssue[] {
  const ctx: Context = {
    issues: [],
    known: new Set<string>(),
    includeWarnings: options.includeWarnings ?? false
  };

  if (!isObject(bundle)) {
    return [
      { path: '$', message: 'Bundle must be an object', severity: 'error', kind: 'fhir-conformance' }
    ];
  }
  if (bundle.resourceType !== 'Bundle') {
    return [
      {
        path: '$.resourceType',
        message: 'resourceType must be "Bundle"',
        severity: 'error',
        kind: 'fhir-conformance'
      }
    ];
  }
  const type = asString(bundle.type);
  if (!type || !SUPPORTED_BUNDLE_TYPES.has(type)) {
    error(ctx, '$.type', `Invalid Bundle.type "${type}"`);
  }
  if (bundle.timestamp === undefined) {
    warning(ctx, '$.timestamp', 'Bundle has no timestamp');
  } else {
    checkDateTime(bundle.timestamp, '$.timestamp', ctx);
  }
  if (!Array.isArray(bundle.entry) || bundle.entry.length === 0) {
    error(ctx, '$.entry', 'Bundle.entry must be a non-empty array');
    return ctx.issues;
  }

  const resources: Record<string, unknown>[] = [];
  const seenKeys = new Set<string>();
  bundle.entry.forEach((entry, index) => {
    if (!isObject(entry) || !isObject(entry.resource)) {
      error(ctx, `$.entry[${index}].resource`, 'resource is required');
      return;
    }
    const resource = entry.resource as Record<string, unknown>;
    const id = asString(resource.id);
    const resourceType = asString(resource.resourceType);
    if (id && resourceType) {
      const key = `${resourceType}/${id}`;
      if (seenKeys.has(key)) {
        error(ctx, `$.entry[${index}].resource`, `Duplicate resource "${key}"`);
      } else {
        seenKeys.add(key);
        ctx.known.add(key);
      }
    }
    if (resourceType === 'AuditEvent') {
      error(
        ctx,
        `$.entry[${index}].resource.resourceType`,
        'AuditEvent must not appear in a clinical export',
        'sahatn-rule'
      );
    }
    resources.push(resource);
  });

  resources.forEach((resource, index) => {
    validateResourceShape(resource, `$.entry[${index}].resource`, ctx);
  });

  visitForbiddenKeys(bundle, '$', ctx, new Set<object>());

  return ctx.issues;
}

// Commodites de filtrage (utilisees par les tests et l'export).
export function fhirErrors(issues: FhirValidationIssue[]): FhirValidationIssue[] {
  return issues.filter((issue) => issue.severity === 'error');
}

export function fhirWarnings(issues: FhirValidationIssue[]): FhirValidationIssue[] {
  return issues.filter((issue) => issue.severity === 'warning');
}
