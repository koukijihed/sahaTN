// Telecharge le schema JSON officiel HL7 FHIR R4 (4.0.1) utilise par la
// validation structurelle independante des Bundles. Le contenu est verifie par
// empreinte SHA-256 avant ecriture : toute divergence fait echouer le script.
//
// Usage : node scripts/fetch-fhir-schema.mjs
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_URL = 'https://hl7.org/fhir/R4/fhir.schema.json';
const EXPECTED_SHA256 =
  '2230406893b4cf002a4ee1e5e2bbeca22ac5d2d4931b3e9ef7b9594bbc376a01';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'test', 'fixtures', 'fhir-r4', 'fhir.schema.json');

const response = await fetch(SCHEMA_URL);
if (!response.ok) {
  throw new Error(`HTTP ${response.status} while fetching ${SCHEMA_URL}`);
}
const buffer = Buffer.from(await response.arrayBuffer());
const digest = createHash('sha256').update(buffer).digest('hex');
if (digest !== EXPECTED_SHA256) {
  throw new Error(
    `Checksum mismatch for ${SCHEMA_URL}\n expected ${EXPECTED_SHA256}\n actual   ${digest}`
  );
}

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, buffer);
console.log(`FHIR R4 schema written to ${target} (${buffer.length} bytes, sha256 ok)`);
