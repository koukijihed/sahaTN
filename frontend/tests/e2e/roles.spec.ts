import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  DEMO_DOCTOR_EMAIL,
  DEMO_FACILITY_NAME,
  DEMO_PASSWORD,
  DEMO_STAFF_EMAIL,
  STRONG_PASSWORD,
  STAFF_FACILITY_NAME,
  loginViaUi,
  logoutViaUi,
  registerPatientViaUi,
  uniqueEmail
} from './helpers';

async function sidebar(page: Page) {
  return page.getByRole('navigation', {
    name: "Navigation de l'espace connecté"
  });
}

test.describe('Parcours professionnel (médecin)', () => {
  test('1. navigation par rôle praticien', async ({ page }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);

    await expect(page.getByText('Praticien', { exact: true })).toBeVisible();
    const nav = await sidebar(page);
    await expect(nav.getByText('Espace praticien')).toBeVisible();
    await expect(nav.getByRole('link', { name: /Mes affiliations/ })).toBeVisible();
    await expect(
      nav.getByRole('link', { name: /Dossiers autorisés/ })
    ).toBeVisible();
    await expect(nav.getByText('Espace patient')).toHaveCount(0);
  });

  test('2. les affiliations vérifiées de démonstration s’affichent', async ({
    page
  }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);
    const nav = await sidebar(page);
    await nav.getByRole('link', { name: /Mes affiliations/ }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Mes affiliations' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: DEMO_FACILITY_NAME })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Gérer l’agenda de consultation/ }).first()
    ).toBeVisible();
  });

  test('3. l’écran d’agenda praticien s’ouvre', async ({ page }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);
    const nav = await sidebar(page);
    await nav.getByRole('link', { name: /Mes affiliations/ }).click();
    await page
      .getByRole('link', { name: /Gérer l’agenda de consultation/ })
      .first()
      .click();

    await expect(page).toHaveURL(/\/dashboard\/schedules\/[^/]+$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Agenda de consultation' })
    ).toBeVisible();
  });

  test('4. aucun dossier patient autorisé par défaut', async ({ page }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);
    const nav = await sidebar(page);
    await nav.getByRole('link', { name: /Dossiers autorisés/ }).click();

    await expect(
      page.getByRole('heading', { level: 1, name: 'Dossiers autorisés' })
    ).toBeVisible();
    await expect(
      page.getByText('Aucun dossier autorisé', { exact: true })
    ).toBeVisible();
  });

  test('5. dialogue de confirmation : ouverture, annulation (Échap), confirmation', async ({
    page
  }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);
    const nav = await sidebar(page);
    await nav.getByRole('link', { name: /Mes affiliations/ }).click();

    const trigger = page
      .getByRole('button', { name: 'Mettre fin à l’affiliation' })
      .first();
    await trigger.focus();
    await trigger.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: /Mettre fin à cette affiliation/ })
    ).toBeVisible();
    // Le focus initial est placé dans le dialogue.
    await expect(
      dialog.getByRole('button', { name: 'Mettre fin' })
    ).toBeFocused();

    // Annulation par Échap.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    // Retour du focus au déclencheur.
    await expect(trigger).toBeFocused();

    // Réouverture puis confirmation (les données sont fictives et éphémères).
    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Mettre fin' })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // L'affiliation est terminée : le bouton de résiliation disparaît et
    // aucun message d'erreur ne s'affiche.
    await expect(
      page.getByRole('button', { name: 'Mettre fin à l’affiliation' })
    ).toHaveCount(0);
    await expect(page.locator('.alert--danger')).toHaveCount(0);
    await expect(page.getByText('Terminée', { exact: true })).toBeVisible();

    await logoutViaUi(page);
  });
});

test.describe('Parcours établissement (personnel)', () => {
  test('1. navigation par rôle établissement', async ({ page }) => {
    await loginViaUi(page, DEMO_STAFF_EMAIL, DEMO_PASSWORD);

    await expect(page.getByText('Établissement', { exact: true })).toBeVisible();
    const nav = await sidebar(page);
    await expect(nav.getByText('Établissements', { exact: true })).toBeVisible();
    await expect(
      nav.getByRole('link', { name: /Annuaire des établissements/ })
    ).toBeVisible();
    await expect(nav.getByText('Espace praticien')).toHaveCount(0);
  });

  test('2. l’espace de gestion de l’établissement géré s’affiche', async ({
    page
  }) => {
    await loginViaUi(page, DEMO_STAFF_EMAIL, DEMO_PASSWORD);

    const response = await page.request.get(
      `/api/facilities?q=${encodeURIComponent('Jabal Al-Fikr')}`
    );
    expect(response.ok()).toBeTruthy();
    const data = (await response.json()) as {
      items: { id: string; displayName: string }[];
    };
    const facility = data.items.find(
      (item) => item.displayName === STAFF_FACILITY_NAME
    );
    expect(facility, 'établissement géré introuvable').toBeTruthy();

    await page.goto(`/facilities/${facility!.id}/manage`);
    await expect(
      page.getByRole('heading', { level: 1, name: STAFF_FACILITY_NAME })
    ).toBeVisible();
    await expect(page.getByText('Vérification', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Soumettre la demande de vérification/ })
    ).toBeVisible();
  });

  test('3. un utilisateur non gestionnaire est refusé sur l’espace de gestion', async ({
    page
  }) => {
    // Un patient fraîchement créé n’est gestionnaire d’aucun établissement.
    const email = uniqueEmail('nonmanager');
    await registerPatientViaUi(page, email);
    await loginViaUi(page, email, STRONG_PASSWORD);

    const list = await page.request.get(`/api/facilities?limit=1`);
    const data = (await list.json()) as { items: { id: string }[] };
    const anyFacilityId = data.items[0].id;

    // Le backend doit refuser l’accès à la vue de gestion (403).
    const manage = await page.request.get(
      `/api/facilities/${anyFacilityId}/manage`
    );
    expect(manage.status()).toBe(403);

    // Et l’interface affiche un message de refus, sans exposer les données.
    await page.goto(`/facilities/${anyFacilityId}/manage`);
    await expect(
      page.getByText('Vous ne gérez pas cet établissement.')
    ).toBeVisible();
  });
});

test.describe('Parcours administrateur', () => {
  test('1. l’administrateur voit un espace minimal sans espace métier', async ({
    page
  }) => {
    await loginViaUi(page, ADMIN_EMAIL, ADMIN_PASSWORD);

    await expect(page.getByText('Administrateur', { exact: true })).toBeVisible();
    const nav = await sidebar(page);
    await expect(nav.getByText('Espace patient')).toHaveCount(0);
    await expect(nav.getByText('Espace praticien')).toHaveCount(0);
    await expect(nav.getByText('Établissements')).toHaveCount(0);

    await logoutViaUi(page);
  });
});
