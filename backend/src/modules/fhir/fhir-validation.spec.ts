import { FhirR4Adapter } from './fhir-r4.adapter';
import { buildDemoSource, DEMO_BUNDLE_ID, DEMO_BUNDLE_TIMESTAMP } from './demo/demo-data';
import { fhirErrors, fhirWarnings, validateFhirBundle } from './fhir-validation';
import type { FhirBundle, FhirResource } from './fhir.types';

function demoBundle(): FhirBundle {
  return new FhirR4Adapter().buildBundle(buildDemoSource(), {
    id: DEMO_BUNDLE_ID,
    generatedAt: DEMO_BUNDLE_TIMESTAMP
  });
}

// Reconstruction profonde simple pour reellement cloner/patcher le Bundle.
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('validateFhirBundle', () => {
  it('accepts the deterministic demo bundle', () => {
    expect(validateFhirBundle(demoBundle())).toEqual([]);
  });

  it('detects a dangling reference between resources', () => {
    const bundle = clone(demoBundle());
    const encounter = bundle.entry!.find(
      (e) => e.resource.resourceType === 'Encounter'
    )!.resource as { serviceProvider: { reference: string } };
    encounter.serviceProvider.reference = 'Organization/99999999-9999-4999-8999-999999999999';
    const issues = validateFhirBundle(bundle);
    expect(issues.some((i) => i.message.includes('no matching resource'))).toBe(true);
  });

  it('detects a malformed reference', () => {
    const bundle = clone(demoBundle());
    const observation = bundle.entry!.find(
      (e) => e.resource.resourceType === 'Observation'
    )!.resource as { subject: { reference: string } };
    observation.subject.reference = 'not a reference';
    expect(
      validateFhirBundle(bundle).some((i) => i.message.includes('Malformed reference'))
    ).toBe(true);
  });

  it('detects a missing required field', () => {
    const bundle = clone(demoBundle());
    const organization = bundle.entry!.find(
      (e) => e.resource.resourceType === 'Organization'
    )!.resource as { name?: string };
    delete organization.name;
    expect(
      validateFhirBundle(bundle).some((i) => i.message.includes('name is required'))
    ).toBe(true);
  });

  it('detects a forbidden sensitive key anywhere in the tree', () => {
    const bundle = clone(demoBundle());
    (bundle as unknown as Record<string, unknown>).storageKey = 'documents/2026/01/abc';
    expect(
      validateFhirBundle(bundle).some((i) => i.message.includes('Forbidden field'))
    ).toBe(true);
  });

  it('detects a private storage path leaking as a string value', () => {
    const bundle = clone(demoBundle());
    const document = bundle.entry!.find(
      (e) => e.resource.resourceType === 'DocumentReference'
    )!.resource as unknown as { content: { attachment: Record<string, unknown> }[] };
    document.content[0].attachment.title = 'storage/private-documents/x.pdf';
    expect(
      validateFhirBundle(bundle).some((i) =>
        i.message.includes('forbidden fragment')
      )
    ).toBe(true);
  });

  it('detects a public download URL on a document attachment', () => {
    const bundle = clone(demoBundle());
    const document = bundle.entry!.find(
      (e) => e.resource.resourceType === 'DocumentReference'
    )!.resource as unknown as { content: { attachment: Record<string, unknown> }[] };
    document.content[0].attachment.url = 'https://example.tn/download/1';
    expect(
      validateFhirBundle(bundle).some((i) => i.message.includes('Attachment.url'))
    ).toBe(true);
  });

  it('detects an unsupported resource type', () => {
    const bundle = clone(demoBundle());
    bundle.entry!.push({
      resource: { resourceType: 'Medication', id: 'x' } as unknown as FhirResource
    });
    expect(
      validateFhirBundle(bundle).some((i) =>
        i.message.includes('Unsupported resource type')
      )
    ).toBe(true);
  });

  it('detects an invalid resource id', () => {
    const bundle = clone(demoBundle());
    bundle.entry![0].resource.id = 'has spaces!';
    expect(
      validateFhirBundle(bundle).some((i) => i.message.includes('Invalid resource id'))
    ).toBe(true);
  });

  it('rejects a non-bundle input', () => {
    expect(validateFhirBundle({ resourceType: 'Patient' })).toHaveLength(1);
    expect(validateFhirBundle(null)).toHaveLength(1);
  });

  it('classifies issues with severity and kind', () => {
    const issues = validateFhirBundle(null);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].kind).toBe('fhir-conformance');

    const bundle = clone(demoBundle());
    (bundle as unknown as Record<string, unknown>).storageKey = 'x';
    const sahatn = validateFhirBundle(bundle).find((i) =>
      i.message.includes('Forbidden field')
    );
    expect(sahatn?.kind).toBe('sahatn-rule');
  });

  it('detects a duplicate resource entry', () => {
    const bundle = clone(demoBundle());
    bundle.entry!.push({ resource: bundle.entry![0].resource });
    expect(
      validateFhirBundle(bundle).some((i) => i.message.includes('Duplicate resource'))
    ).toBe(true);
  });

  it('requires Provenance.recorded and a non-empty target', () => {
    const bundle = clone(demoBundle());
    const provenance = bundle.entry!.find(
      (e) => e.resource.resourceType === 'Provenance'
    )!.resource as unknown as Record<string, unknown>;
    delete provenance.recorded;
    delete provenance.target;
    const issues = validateFhirBundle(bundle);
    expect(issues.some((i) => i.message.includes('Provenance.recorded is required'))).toBe(true);
    expect(issues.some((i) => i.message.includes('At least one reference is required'))).toBe(true);
  });

  it('rejects an AuditEvent in a clinical export and an email used as identifier', () => {
    const withAudit = clone(demoBundle());
    withAudit.entry!.push({
      resource: { resourceType: 'AuditEvent', id: 'audit-1' } as unknown as FhirResource
    });
    expect(
      validateFhirBundle(withAudit).some((i) =>
        i.message.includes('AuditEvent must not appear')
      )
    ).toBe(true);

    const withEmail = clone(demoBundle());
    const patient = withEmail.entry!.find(
      (e) => e.resource.resourceType === 'Patient'
    )!.resource as unknown as { identifier: { value: string }[] };
    patient.identifier[0].value = 'patient.demo@example.tn';
    expect(
      validateFhirBundle(withEmail).some((i) =>
        i.message.includes('must not be a contact')
      )
    ).toBe(true);
  });

  it('returns warnings only when requested, keeping errors separate', () => {
    const bundle = clone(demoBundle());
    // Retire un champ optionnel : un avertissement doit apparaitre si demande.
    delete (bundle.entry![0].resource as unknown as Record<string, unknown>).meta;

    const errorsOnly = validateFhirBundle(bundle);
    expect(fhirWarnings(errorsOnly)).toHaveLength(0);

    const withWarnings = validateFhirBundle(bundle, { includeWarnings: true });
    expect(fhirErrors(withWarnings)).toEqual(fhirErrors(errorsOnly));
    expect(fhirWarnings(withWarnings).length).toBeGreaterThan(0);
  });
});

