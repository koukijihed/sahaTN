import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';

// Configuration applicative partagee entre le bootstrap de production
// (`main.ts`) et les tests e2e. Centraliser ces reglages garantit que les tests
// exercent EXACTEMENT la meme pile de middlewares que le serveur reel
// (helmet, cookie-parser, prefixe global, ValidationPipe, filtre d'exception,
// CORS) : sans quoi un test d'en-tetes de securite pourrait passer au vert
// alors que la production est mal configuree, ou inversement.
//
// Politique CSP : une politique explicite et restrictive est preferable au
// defaut de helmet. Le frontend Next.js injecte des styles en ligne et des
// scripts avec nonce/hydratation ; on garde donc `'unsafe-inline'` pour les
// styles, `'unsafe-eval'` uniquement hors production, et on interdit tout
// cadrage, objet et base arbitraire. `frame-ancestors 'none'` est redondant
// avec X-Frame-Options mais reste la defense moderne.
export interface AppConfigurationOptions {
  apiPrefix?: string;
  corsOrigin?: string;
  enableCsp?: boolean;
  isProduction?: boolean;
}

export function buildContentSecurityPolicy(isProduction: boolean): string {
  const scriptSrc = isProduction
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-eval'";
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

export function configureApp(
  app: INestApplication,
  options: AppConfigurationOptions = {}
): void {
  const isProduction =
    options.isProduction ?? process.env.NODE_ENV === 'production';

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'script-src': isProduction
            ? ["'self'"]
            : ["'self'", "'unsafe-eval'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'none'"]
        }
      },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Aligne X-Frame-Options sur `frame-ancestors 'none'` (defense ancienne +
      // moderne) ; le defaut de helmet est `SAMEORIGIN`.
      frameguard: { action: 'deny' }
    })
  );
  app.use(cookieParser());

  const apiPrefix = options.apiPrefix ?? process.env.API_PREFIX ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const corsOrigin = (
    options.corsOrigin ??
    process.env.CORS_ORIGIN ??
    'http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // `credentials: true` est requis pour les cookies de session ; on n'utilise
  // jamais `origin: '*'` (incompatible avec les credentials).
  app.enableCors({ origin: corsOrigin, credentials: true });
}

export function configureAppFromEnv(app: INestApplication): void {
  configureApp(app, {
    apiPrefix: process.env.API_PREFIX ?? 'api',
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    isProduction: process.env.NODE_ENV === 'production'
  });
}
