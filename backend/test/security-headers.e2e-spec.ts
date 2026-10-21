import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { buildContentSecurityPolicy, configureApp } from '../src/bootstrap/configure-app';

// Regression : les en-tetes de securite doivent etre poses par la MEME pile de
// middlewares que la production. On applique `configureApp` (utilise par
// `main.ts`) plutot que de construire une application nue, sinon le test ne
// prouverait rien sur le serveur reel.
describe('Security headers (e2e)', () => {
  describe('production profile', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();

      app = moduleRef.createNestApplication();
      configureApp(app, {
        apiPrefix: 'api',
        corsOrigin: 'http://localhost:3000',
        isProduction: true
      });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('sets core security headers on the health endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['referrer-policy']).toBe(
        'strict-origin-when-cross-origin'
      );
      expect(response.headers['cross-origin-resource-policy']).toBe(
        'same-origin'
      );
      // Helmet desactive par defaut `x-powered-by` : jamais d'empreinte serveur.
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('exposes an explicit Content-Security-Policy without unsafe-eval', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      // En production, aucun eval autorise.
      expect(csp).not.toContain("'unsafe-eval'");
    });
  });

  describe('development profile', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule]
      }).compile();

      app = moduleRef.createNestApplication();
      configureApp(app, {
        apiPrefix: 'api',
        corsOrigin: 'http://localhost:3000',
        isProduction: false
      });
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('allows unsafe-eval in the CSP outside production (Next.js dev)', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      const csp = response.headers['content-security-policy'];
      expect(csp).toContain("'unsafe-eval'");
    });
  });

  it('buildContentSecurityPolicy never allows object embedding or framing', () => {
    for (const isProduction of [true, false]) {
      const csp = buildContentSecurityPolicy(isProduction);
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("default-src 'self'");
    }
  });
});
