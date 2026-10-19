import { expect, test } from '@playwright/test';
import {
  DEMO_DOCTOR_EMAIL,
  DEMO_PASSWORD,
  STRONG_PASSWORD,
  loginViaUi,
  registerPatientViaUi,
  uniqueEmail
} from './helpers';

const PROTECTED_GET_ENDPOINTS = [
  '/api/auth/me',
  '/api/medical-records/me',
  '/api/medical-records/me/documents',
  '/api/medical-records/me/grants',
  '/api/medical-records/patients',
  '/api/doctors/me/affiliations'
];

test.describe('Sécurité et cloisonnement des rôles', () => {
  test('1. sans session, les ressources protégées répondent 401', async ({
    request
  }) => {
    for (const endpoint of PROTECTED_GET_ENDPOINTS) {
      const response = await request.get(endpoint);
      expect(response.status(), `${endpoint} doit être protégé`).toBe(401);
    }
  });

  test('2. un patient ne peut pas lire le dossier médical d’un patient', async ({
    page
  }) => {
    const email = uniqueEmail('isolation');
    await registerPatientViaUi(page, email);
    await loginViaUi(page, email, STRONG_PASSWORD);

    const me = await page.context().request.get('/api/auth/me');
    const { user } = (await me.json()) as { user: { id: string } };

    // Le patient n’est pas praticien : l’accès au dossier nominatif est refusé.
    const ownRecord = await page.context().request.get(
      `/api/medical-records/patients/${user.id}`
    );
    expect([403, 404]).toContain(ownRecord.status());

    // Un identifiant arbitraire ne doit rien exposer non plus.
    const foreign = await page.context().request.get(
      `/api/medical-records/patients/00000000-0000-0000-0000-000000000000`
    );
    expect([403, 404]).toContain(foreign.status());
  });

  test('3. un médecin n’accède qu’aux dossiers consentis', async ({ page }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);

    // Aucun consentement n’est créé par le seed : la liste doit être vide.
    const list = await page.context().request.get(
      '/api/medical-records/patients'
    );
    expect(list.ok()).toBeTruthy();
    expect((await list.json()) as unknown[]).toEqual([]);

    // Un dossier arbitraire est refusé.
    const foreign = await page.context().request.get(
      `/api/medical-records/patients/00000000-0000-0000-0000-000000000000`
    );
    expect([403, 404]).toContain(foreign.status());
  });

  test('4. aucune donnée sensible n’est exposée par les API publiques', async ({
    page
  }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);

    const meResponse = await page.context().request.get('/api/auth/me');
    const meBody = await meResponse.text();
    expect(meBody).not.toMatch(/passwordHash|password_hash|\bsalt\b/i);

    const doctors = await page.context().request.get('/api/doctors?limit=1');
    const doctorsBody = await doctors.text();
    expect(doctorsBody).not.toMatch(/passwordHash|password_hash/i);
    const parsed = JSON.parse(doctorsBody) as { items: { id: string }[] };
    if (parsed.items.length > 0) {
      const profile = await page.context().request.get(
        `/api/doctors/${parsed.items[0].id}`
      );
      expect(await profile.text()).not.toMatch(/passwordHash|password_hash/i);
    }
  });
});
