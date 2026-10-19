import { expect, test, type Page } from '@playwright/test';
import {
  STRONG_PASSWORD,
  loginViaUi,
  registerPatientViaUi,
  uniqueEmail
} from './helpers';

async function newPatient(page: Page): Promise<string> {
  const email = uniqueEmail('patient');
  await registerPatientViaUi(page, email);
  await loginViaUi(page, email, STRONG_PASSWORD);
  return email;
}

function sidebar(page: Page) {
  return page.getByRole('navigation', {
    name: "Navigation de l'espace connecté"
  });
}

test.describe('Parcours patient', () => {
  test('1. navigation par rôle : sections patient uniquement', async ({
    page
  }) => {
    await newPatient(page);

    await expect(sidebar(page).getByText('Espace patient')).toBeVisible();
    await expect(
      sidebar(page).getByRole('link', { name: /Mes rendez-vous/ })
    ).toBeVisible();
    await expect(
      sidebar(page).getByRole('link', { name: /Mon dossier médical/ })
    ).toBeVisible();
    await expect(
      sidebar(page).getByRole('link', { name: /Mes documents/ })
    ).toBeVisible();
    await expect(
      sidebar(page).getByRole('link', { name: /Accès & consentements/ })
    ).toBeVisible();
    await expect(sidebar(page).getByText('Espace praticien')).toHaveCount(0);
  });

  test('2. la page rendez-vous affiche un état vide propre', async ({ page }) => {
    await newPatient(page);
    await sidebar(page)
      .getByRole('link', { name: /Mes rendez-vous/ })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/appointments$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mes rendez-vous' })
    ).toBeVisible();
    await expect(page.getByText('Aucun rendez-vous', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Aucune notification', { exact: true })
    ).toBeVisible();
  });

  test('3. le dossier médical s’affiche avec ses compteurs', async ({ page }) => {
    await newPatient(page);
    await sidebar(page)
      .getByRole('link', { name: /Mon dossier médical/ })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/records$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mon dossier médical' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Consultations' })
    ).toBeVisible();
    await expect(page.getByText('Aucune consultation', { exact: true })).toBeVisible();
  });

  test('4. les documents et l’accès au dossier s’affichent', async ({ page }) => {
    await newPatient(page);

    await sidebar(page)
      .getByRole('link', { name: /Mes documents/ })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/records\/documents$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mes documents médicaux' })
    ).toBeVisible();

    await sidebar(page)
      .getByRole('link', { name: /Accès & consentements/ })
      .click();
    await expect(page).toHaveURL(/\/dashboard\/records\/access$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Accès à mon dossier' })
    ).toBeVisible();
  });

  test('5. un patient n’obtient aucune donnée praticien (cloisonnement des rôles)', async ({
    page
  }) => {
    await newPatient(page);

    await expect(
      sidebar(page).getByRole('link', { name: /Mes affiliations/ })
    ).toHaveCount(0);
    await expect(sidebar(page).getByText('Espace praticien')).toHaveCount(0);

    // Même en saisissant l’URL directement, aucune affiliation de praticien
    // n’est exposée (la requête est filtrée par le backend).
    await page.goto('/dashboard/affiliations');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mes affiliations' })
    ).toBeVisible();
    await expect(
      page.getByText('Aucune affiliation', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Polyclinique Les Palmiers')).toHaveCount(0);
  });
});
