// SahaTN - Base de donnees locale PERSISTANTE pour le developpement hors-ligne.
// Demarre un PostgreSQL embarque dans backend/.dev-postgres, applique les
// migrations, charge les donnees de demonstration (fictives) puis reste actif
// jusqu'a Ctrl+C. Aucune donnee reelle, aucun service externe.
import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(backendDir, '.dev-postgres', 'data');
const port = Number(process.env.DEV_DB_PORT || 55434);
const dbName = process.env.DEV_DB_NAME || 'sahatn';
const databaseUrl = `postgresql://postgres:postgres@localhost:${port}/${dbName}`;

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C']
});

const alreadyInitialised = existsSync(join(dataDir, 'PG_VERSION'));

const shutdown = async () => {
  try {
    await pg.stop();
  } catch {
    // Arret deja effectue.
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  if (!alreadyInitialised) {
    mkdirSync(dataDir, { recursive: true });
    console.log('Initialisation du cluster PostgreSQL local...');
    await pg.initialise();
  }

  console.log(`Demarrage de PostgreSQL sur le port ${port}...`);
  await pg.start();

  if (!alreadyInitialised) {
    console.log(`Creation de la base ${dbName}...`);
    await pg.createDatabase(dbName);
  }

  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: process.env.NODE_ENV || 'development'
  };

  console.log('Application des migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });

  console.log('Chargement des donnees de demonstration (fictives)...');
  execSync('npx prisma db seed', { stdio: 'inherit', env });

  if (process.env.DEV_ADMIN_EMAIL && process.env.DEV_ADMIN_PASSWORD) {
    console.log("Creation du compte administrateur local...");
    execSync('node scripts/create-admin.mjs', {
      stdio: 'inherit',
      env: {
        ...env,
        ADMIN_EMAIL: process.env.DEV_ADMIN_EMAIL,
        ADMIN_PASSWORD: process.env.DEV_ADMIN_PASSWORD
      }
    });
  }

  console.log('');
  console.log('Base de developpement prete.');
  console.log(`  DATABASE_URL=${databaseUrl}`);
  console.log('  Laissez ce terminal ouvert, puis lancez dans un autre terminal :');
  console.log('    npm run start:dev');
  console.log(
    '  Compte administrateur : relancez avec DEV_ADMIN_EMAIL et DEV_ADMIN_PASSWORD,'
  );
  console.log('  ou renseignez DATABASE_URL puis `npm run create-admin`.');
  console.log('  Arret : Ctrl+C.');
  console.log('');

  await new Promise(() => {});
} catch (error) {
  console.error('Echec du demarrage de la base de developpement :');
  console.error(error);
  await shutdown();
}
