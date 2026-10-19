import EmbeddedPostgres from 'embedded-postgres';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const externalUrl = process.env.TEST_DATABASE_URL;
const port = Number(process.env.TEST_DB_PORT || 55432);
const databaseDir = externalUrl
  ? null
  : mkdtempSync(join(tmpdir(), 'sahatn-pg-'));

let pg = null;
let databaseUrl = externalUrl;
const env = {
  ...process.env,
  NODE_ENV: 'test',
  THROTTLE_LIMIT: '100000',
  LOGIN_THROTTLE_LIMIT: '100000',
  REGISTER_THROTTLE_LIMIT: '100000'
};

try {
  if (!externalUrl) {
    pg = new EmbeddedPostgres({
      databaseDir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C']
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('sahatn_test');
    databaseUrl = `postgresql://postgres:postgres@localhost:${port}/sahatn_test`;
  }

  env.DATABASE_URL = databaseUrl;
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env });
  execSync('npx jest --config ./test/jest-e2e.json --runInBand', {
    stdio: 'inherit',
    env
  });
} finally {
  if (pg) {
    await pg.stop();
  }
  if (databaseDir) {
    rmSync(databaseDir, { recursive: true, force: true });
  }
}
