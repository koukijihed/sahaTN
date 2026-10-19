import { Injectable } from '@nestjs/common';
import { FHIR_EXPORT_BUNDLE_TYPE, FHIR_R4_VERSION } from './fhir.constants';
import type { FhirExportSource } from './fhir.sources';
import type { FhirBundle, FhirResource } from './fhir.types';
import {
  toFhirAllergyIntolerance,
  toFhirCondition,
  toFhirDocumentReference,
  toFhirEncounter,
  toFhirObservation,
  toFhirOrganization,
  toFhirPatient,
  toFhirPractitioner,
  toFhirProvenance,
  toInstant
} from './converters';
import {
  BundleBuildOptions,
  InteroperabilityAdapter
} from './interoperability.port';

// Tri deterministe des entrees : par type puis par identifiant. Deux exports
// construits a partir de la meme source produisent le meme Bundle (octet pour
// octet, hors horodatage explicite).
function compareResources(a: FhirResource, b: FhirResource): number {
  if (a.resourceType !== b.resourceType) {
    return a.resourceType < b.resourceType ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Adaptateur par defaut : produit un Bundle FHIR R4 de type `collection`.
@Injectable()
export class FhirR4Adapter implements InteroperabilityAdapter {
  readonly id = 'fhir-r4-collection';
  readonly fhirVersion = FHIR_R4_VERSION;

  buildBundle(
    source: FhirExportSource,
    options: BundleBuildOptions = {}
  ): FhirBundle {
    const practitionerIds = new Set(source.practitioners.map((p) => p.id));
    const resources: FhirResource[] = [toFhirPatient(source.patient)];

    dedupeById(source.practitioners).forEach((practitioner) =>
      resources.push(toFhirPractitioner(practitioner))
    );
    dedupeById(source.organizations).forEach((organization) =>
      resources.push(toFhirOrganization(organization))
    );
    source.encounters.forEach((encounter) =>
      resources.push(toFhirEncounter(encounter, source.patient.id))
    );
    source.observations.forEach((observation) =>
      resources.push(toFhirObservation(observation, source.patient.id))
    );
    source.conditions.forEach((condition) =>
      resources.push(toFhirCondition(condition, source.patient.id))
    );
    source.allergies.forEach((allergy) =>
      resources.push(toFhirAllergyIntolerance(allergy, source.patient.id))
    );
    source.documents.forEach((document) => {
      resources.push(toFhirDocumentReference(document, source.patient.id));
      // Provenance uniquement si l'auteur (professionnel) est reellement connu
      // ET present dans le Bundle.
      if (
        document.uploaderDoctorProfileId &&
        practitionerIds.has(document.uploaderDoctorProfileId)
      ) {
        resources.push(
          toFhirProvenance({
            documentId: document.id,
            authorPractitionerId: document.uploaderDoctorProfileId,
            recordedAt: document.createdAt
          })
        );
      }
    });

    resources.sort(compareResources);

    const bundle: FhirBundle = {
      resourceType: 'Bundle',
      type: FHIR_EXPORT_BUNDLE_TYPE,
      entry: resources.map((resource) => ({ resource }))
    };

    if (options.id) {
      bundle.id = options.id;
    }
    if (options.generatedAt) {
      bundle.timestamp = toInstant(options.generatedAt);
    }

    return bundle;
  }
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}
