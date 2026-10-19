import { expect, test, request as playwrightRequest } from '@playwright/test';
import {
  STRONG_PASSWORD,
  loginViaUi,
  logoutViaUi,
  registerPatientViaUi,
  uniqueEmail
} from './helpers';

test.describe('Authentification (navigateur)', () => {
  test('1. inscription puis connexion d’un patient fictif', async ({ page }) => {
    const email = uniqueEmail('auth');

    await registerPatientViaUi(page, email);

    await loginViaUi(page, email, STRONG_PASSWORD);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tableau de bord' })
    ).toBeVisible();
    await expect(page.getByText('Patient', { exact: true })).toBeVisible();
  });

  test('2. identifiants invalides → message générique, aucun détail', async ({
    page
  }) => {
    const email = uniqueEmail('inconnu');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mot de passe').fill('WrongPassw0rd!99');
    await page.getByRole('button', { name: 'Se connecter' }).click();

    const alert = page.locator('.alert--danger');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Identifiants invalides');
    await expect(alert).not.toContainText(/mot de passe|existe|token|session/i);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('3. un mot de passe trop faible est bloqué côté formulaire', async ({
    page
  }) => {
    await page.goto('/register');
    await page.getByLabel('Email').fill(uniqueEmail('faible'));
    await page.getByLabel('Mot de passe').fill('court1');
    await page.getByRole('button', { name: "S'inscrire" }).click();

    const isValid = await page
      .getByLabel('Mot de passe')
      .evaluate((el) => (el as HTMLInputElement).checkValidity());
    expect(isValid).toBe(false);
    await expect(page).toHaveURL(/\/register$/);
  });

  test('4. la déconnexion met à jour l’état et protège l’espace connecté', async ({
    page
  }) => {
    const email = uniqueEmail('logout');
    await registerPatientViaUi(page, email);
    await loginViaUi(page, email, STRONG_PASSWORD);

    await logoutViaUi(page);
    await expect(
      page.getByRole('link', { name: 'Se connecter' }).first()
    ).toBeVisible();

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('5. une session révoquée côté serveur entraîne une redirection', async ({
    page,
    baseURL
  }) => {
    const email = uniqueEmail('revoked');
    await registerPatientViaUi(page, email);

    const api = await playwrightRequest.newContext({ baseURL });
    try {
      const loginResponse = await api.post('/api/auth/login', {
        data: { email, password: STRONG_PASSWORD }
      });
      expect(loginResponse.ok()).toBeTruthy();

      const state = await api.storageState();
      await page.context().addCookies(state.cookies);

      // Révocation de la session côté serveur (comme une expiration/ révocation).
      const csrf = state.cookies.find((c) => c.name === 'sahatn_csrf')?.value;
      await api.post('/api/auth/logout', {
        headers: { 'x-csrf-token': csrf ?? '' }
      });

      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login$/);
    } finally {
      await api.dispose();
    }
  });

  test('6. un utilisateur non authentifié reçoit 401 sur les API protégées', async ({
    baseURL
  }) => {
    const api = await playwrightRequest.newContext({ baseURL });
    try {
      const response = await api.get('/api/medical-records/me');
      expect(response.status()).toBe(401);
    } finally {
      await api.dispose();
    }
  });
});
