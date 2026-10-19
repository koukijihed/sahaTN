import { FhirR4Adapter } from './fhir-r4.adapter';
import { buildDemoSource, DEMO_BUNDLE_ID, DEMO_BUNDLE_TIMESTAMP } from './demo/demo-data';
import type { FhirBundle, FhirResource } from './fhir.types';
import {
  FHIR_R4_SCHEMA_URL,
  FHIR_R4_SCHEMA_VERSION,
  isFhirSchemaAvailable,
  validateFhirBundleAgainstSchema
} from './fhir-schema-validation';

// Validation INDEPENDANTE : Bundles testes contre le schema JSON OFFICIEL de
// HL7 FHIR R4 (4.0.1). Voir test/fixtures/fhir-r4/PROVENANCE.md.

function demoBundle(): FhirBundle {
  return new FhirR4Adapter().buildBundle(buildDemoSource(), {
    id: DEMO_BUNDLE_ID,
    generatedAt: DEMO_BUNDLE_TIMESTAMP
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const available = isFhirSchemaAvailable();

describe('FHIR R4 official JSON schema validation', () => {
  it('documents the pinned schema version and source', () => {
    expect(FHIR_R4_SCHEMA_VERSION).toBe('4.0.1');
    expect(FHIR_R4_SCHEMA_URL).toBe('https://hl7.org/fhir/R4/fhir.schema.json');
  });

  (available ? it : it.skip)(
    'accepts the deterministic demo bundle against the official schema',
    () => {
      expect(validateFhirBundleAgainstSchema(demoBundle())).toEqual([]);
    }
  );

  (available ? it : it.skip)(
    'rejects a structurally invalid bundle against the official schema',
    () => {
      const bundle = clone(demoBundle());
      const observation = bundle.entry!.find(
        (entry) => entry.resource.resourceType === 'Observation'
      )!.resource as unknown as Record<string, unknown>;
      // `status` doit etre une chaine issue d'une enumeration : un nombre est invalide.
      observation.status = 42;
      const issues = validateFhirBundleAgainstSchema(bundle);
      expect(issues.length).toBeGreaterThan(0);
      expect(issues.every((issue) => issue.kind === 'fhir-conformance')).toBe(true);
    }
  );

  (available ? it : it.skip)(
    'rejects a bundle with an unknown resource type against the official schema',
    () => {
      const bundle = clone(demoBundle());
      bundle.entry!.push({
        resource: { resourceType: 'NotAResource', id: 'x' } as unknown as FhirResource
      });
      expect(validateFhirBundleAgainstSchema(bundle).length).toBeGreaterThan(0);
    }
  );
});
