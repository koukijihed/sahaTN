// SahaTN - Serveur backend pour les tests navigateur (Jour 14).
//
// Demarre une base PostgreSQL ephemere (embedded) + migrations Prisma + jeu de
// donnees fictif, puis lance le serveur NestJS compile (dist/main.js) pour que
// Playwright puisse le piloter via l'interface web. Aucune donnee reelle.
//
// Prerequis : `npm run build` (backend) doit avoir produit dist/main.js.
// Ce script est lance par la configuration Playwright du frontend ; il est
// egalement utilisable seul pour deboguer.
import EmbeddedPostgres from 'embedded-postgres';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..', '..');

const dbPort = Number(process.env.BROWSER_DB_PORT || 55433);
// NOTE : le backend valide PORT comme un entier et n'accepte pas une valeur
// sous forme de chaine (limite connue de la validation d'environnement). Le
// serveur est donc lance sur le port par defaut (4000) ; la configuration
// Playwright doit utiliser le meme port.
const apiPort = Number(process.env.BROWSER_API_PORT || 4000);
const databaseDir = mkdtempSync(join(tmpdir(), 'sahatn-browser-pg-'));
const storageDir = mkdtempSync(join(tmpdir(), 'sahatn-browser-docs-'));

const env = {
  ...process.env,
  NODE_ENV: 'test',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3100',
  THROTTLE_LIMIT: '100000',
  LOGIN_THROTTLE_LIMIT: '100000',
  REGISTER_THROTTLE_LIMIT: '100000',
  DOCUMENT_STORAGE_DIR: storageDir
};
// Ne jamais transmettre PORT en chaine : voir la note ci-dessus.
delete env.PORT;
if (apiPort !== 4000) {
  console.warn(
    `[browser-server] BROWSER_API_PORT=${apiPort} ignore : le backend doit ` +
      'demarrer sur 4000 (PORT non surchargeable en chaine).'
  );
}

const DEMO_PASSWORD = 'DemoPassw0rd!2024';
const ADMIN_EMAIL = process.env.BROWSER_ADMIN_EMAIL || 'admin.browser@sahatn.example';
const ADMIN_PASSWORD = process.env.BROWSER_ADMIN_PASSWORD || 'AdminPassw0rd!2024';

let pg = null;
let server = null;
let cleanedUp = false;

function run(command, args) {
  execFileSync(command, args, { cwd: backendRoot, env, stdio: 'inherit' });
}

async function cleanup(code = 0) {
  if (cleanedUp) {
    return;
  }
  cleanedUp = true;
  if (server && !server.killed) {
    server.kill();
  }
  if (pg) {
    try {
      await pg.stop();
    } catch {
      // ignore
    }
  }
  rmSync(databaseDir, { recursive: true, force: true });
  rmSync(storageDir, { recursive: true, force: true });
  process.exit(code);
}

async function main() {
  pg = new EmbeddedPostgres({
    databaseDir,
    user: 'postgres',
    password: 'postgres',
    port: dbPort,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C']
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('sahatn_browser');
  env.DATABASE_URL = `postgresql://postgres:postgres@localhost:${dbPort}/sahatn_browser`;

  console.log('[browser-server] Applying migrations...');
  run(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy']);

  console.log('[browser-server] Seeding fictional demo data...');
  run(process.execPath, ['prisma/seed.mjs']);

  console.log('[browser-server] Ensuring administrator account...');
  run(process.execPath, ['scripts/create-admin.mjs']);

  console.log(`[browser-server] Starting API on :${apiPort}...`);
  server = spawn(process.execPath, ['dist/main.js'], {
    cwd: backendRoot,
    env,
    stdio: 'inherit'
  });
  server.on('exit', (code) => {
    console.error(`[browser-server] API exited with code ${code}`);
    void cleanup(code ?? 1);
  });
}

process.on('SIGINT', () => void cleanup(0));
process.on('SIGTERM', () => void cleanup(0));

env.ADMIN_EMAIL = ADMIN_EMAIL;
env.ADMIN_PASSWORD = ADMIN_PASSWORD;
console.log(
  `[browser-server] Demo accounts: doctor=demo.doctor@sahatn.example, ` +
    `staff=demo.staff@sahatn.example, admin=${ADMIN_EMAIL} ` +
    `(mot de passe demo: ${DEMO_PASSWORD}).`
);

main().catch((error) => {
  console.error('[browser-server] Failed to start:', error);
  void cleanup(1);
});
