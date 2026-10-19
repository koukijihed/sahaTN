import { join } from 'node:path';
import { resolveApiDocsEnabled } from './env.validation';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  corsOrigin: string;
  databaseUrl: string;
  apiPrefix: string;
  enableApiDocs: boolean;
  sessionCookieName: string;
  csrfCookieName: string;
  sessionTtlSeconds: number;
  cookieDomain: string;
  loginMaxAttempts: number;
  loginLockMinutes: number;
  documentStorageDir: string;
  documentMaxFileBytes: number;
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  databaseUrl:
    process.env.DATABASE_URL ??
    'postgresql://sahatn:sahatn@localhost:5432/sahatn',
  apiPrefix: process.env.API_PREFIX ?? 'api',
  enableApiDocs: resolveApiDocsEnabled(
    process.env.ENABLE_API_DOCS,
    process.env.NODE_ENV ?? 'development'
  ),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? 'sahatn_session',
  csrfCookieName: process.env.CSRF_COOKIE_NAME ?? 'sahatn_csrf',
  sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS ?? '604800', 10),
  cookieDomain: process.env.COOKIE_DOMAIN ?? '',
  loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS ?? '5', 10),
  loginLockMinutes: parseInt(process.env.LOGIN_LOCK_MINUTES ?? '15', 10),
  // Espace de stockage prive des documents medicaux (hors repertoire public).
  // Jamais servi directement par URL : l'acces passe toujours par l'API et le
  // moteur d'autorisation.
  documentStorageDir:
    process.env.DOCUMENT_STORAGE_DIR?.trim() ||
    join(process.cwd(), 'storage', 'private-documents'),
  documentMaxFileBytes: parseInt(
    process.env.DOCUMENT_MAX_FILE_BYTES ?? String(5 * 1024 * 1024),
    10
  )
});
