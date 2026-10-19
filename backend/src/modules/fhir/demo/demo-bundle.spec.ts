import { FhirR4Adapter } from '../fhir-r4.adapter';
import { validateFhirBundle } from '../fhir-validation';
import type { FhirBundle, FhirResource } from '../fhir.types';
import { buildDemoSource, DEMO_BUNDLE_ID, DEMO_BUNDLE_TIMESTAMP } from './demo-data';

function bundle(): FhirBundle {
  return new FhirR4Adapter().buildBundle(buildDemoSource(), {
    id: DEMO_BUNDLE_ID,
    generatedAt: DEMO_BUNDLE_TIMESTAMP
  });
}

function typesOf(value: FhirBundle): string[] {
  return (value.entry ?? []).map((entry) => entry.resource.resourceType).sort();
}

describe('demo FHIR R4 bundle', () => {
  it('is deterministic for identical input', () => {
    expect(bundle()).toEqual(bundle());
  });

  it('is a structurally valid Bundle with a fixed timestamp and id', () => {
    const value = bundle();
    expect(value.resourceType).toBe('Bundle');
    expect(value.type).toBe('collection');
    expect(value.id).toBe(DEMO_BUNDLE_ID);
    expect(value.timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(validateFhirBundle(value)).toEqual([]);
  });

  it('contains the priority resource types and their traceability', () => {
    expect(typesOf(bundle())).toEqual(
      [
        'AllergyIntolerance',
        'Condition',
        'DocumentReference',
        'Encounter',
        'Observation',
        'Organization',
        'Patient',
        'Practitioner',
        'Provenance'
      ].sort()
    );
  });

  it('keeps references consistent (every reference resolves)', () => {
    const value = bundle();
    const known = new Set(
      (value.entry ?? []).map(
        (entry) => `${entry.resource.resourceType}/${entry.resource.id}`
      )
    );
    const references: string[] = [];
    const collect = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(collect);
        return;
      }
      if (node && typeof node === 'object') {
        const record = node as Record<string, unknown>;
        if (typeof record.reference === 'string') {
          references.push(record.reference);
        }
        Object.values(record).forEach(collect);
      }
    };
    collect(value);
    expect(references.length).toBeGreaterThan(0);
    references.forEach((reference) => expect(known.has(reference)).toBe(true));
  });

  it('never exposes storage keys, private paths, session secrets or download URLs', () => {
    const serialized = JSON.stringify(bundle());
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('private-documents');
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('csrf');
    // Aucun champ cle `url` (les valeurs `"system":"url"` de telecom restent
    // autorisees car ce sont des coordonnees, pas des liens de telechargement).
    expect(serialized).not.toContain('"url":');
  });

  it('emits a Provenance for the document because its author is known', () => {
    const provenance = bundle().entry?.find(
      (entry) => entry.resource.resourceType === 'Provenance'
    )?.resource as FhirResource & { agent: { who: { reference: string } }[] };
    expect(provenance).toBeDefined();
    expect(provenance.agent[0].who.reference).toMatch(/^Practitioner\//);
  });

  it('does not include an AuditEvent (security audit is out of the clinical bundle)', () => {
    expect(typesOf(bundle())).not.toContain('AuditEvent');
  });
});
