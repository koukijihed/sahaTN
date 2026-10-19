import { expect, test } from '@playwright/test';
import { DEMO_FACILITY_NAME, analyzeAccessibility } from './helpers';

test.describe('Parcours public (non authentifié)', () => {
  test('1. l’accueil s’affiche avec l’en-tête et le pied de page', async ({
    page
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Trouvez un médecin ou un établissement/i
      })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /SahaTN — accueil/i })
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  });

  test('2. la navigation principale mène à la connexion, l’inscription et les annuaires', async ({
    page
  }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'Se connecter' }).first().click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/');
    await page.getByRole('link', { name: 'Créer un compte' }).first().click();
    await expect(page).toHaveURL(/\/register$/);

    const primaryNav = page.getByRole('navigation', {
      name: 'Navigation principale'
    });

    await page.goto('/');
    await primaryNav.getByRole('link', { name: 'Recherche' }).click();
    await expect(page).toHaveURL(/\/search$/);

    await page.goto('/');
    await primaryNav.getByRole('link', { name: 'Médecins' }).click();
    await expect(page).toHaveURL(/\/doctors$/);

    await page.goto('/');
    await primaryNav.getByRole('link', { name: 'Établissements' }).click();
    await expect(page).toHaveURL(/\/facilities$/);
  });

  test('3. la recherche affiche des résultats et mène aux fiches', async ({
    page
  }) => {
    await page.goto('/search');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Recherche' })
    ).toBeVisible();
    await expect(page.getByText(/résultat\(s\)/i)).toBeVisible();

    const doctorsSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Médecins', exact: true })
    });
    await expect(doctorsSection.getByRole('link').first()).toBeVisible();
    await doctorsSection.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/doctors\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/search');
    const facilitiesSection = page.locator('section', {
      has: page.getByRole('heading', { name: 'Établissements', exact: true })
    });
    await expect(facilitiesSection.getByRole('link').first()).toBeVisible();
    await facilitiesSection.getByRole('link').first().click();
    await expect(page).toHaveURL(/\/facilities\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('4. une recherche sans résultat affiche un état vide', async ({ page }) => {
    await page.goto('/search');
    await page
      .getByRole('searchbox', { name: 'Recherche' })
      .fill('zzzzzz-inexistant-zzzzzz');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await expect(page.getByText('Aucun médecin', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Aucun établissement', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('0 résultat(s).')).toBeVisible();
  });

  test('5. une erreur réseau est affichée proprement (pas de page blanche)', async ({
    page
  }) => {
    await page.route('**/api/search**', (route) =>
      route.fulfill({ status: 500, body: '{}' })
    );
    await page.goto('/search');
    await expect(
      page.getByText(/Impossible d.exécuter la recherche/)
    ).toBeVisible();

    await page.unroute('**/api/search**');
  });

  test('6. la fiche établissement de démonstration est accessible', async ({
    page
  }) => {
    await page.goto('/facilities');
    await page.getByLabel('Recherche').fill(DEMO_FACILITY_NAME);
    await page.getByRole('button', { name: 'Appliquer les filtres' }).click();
    const link = page.getByRole('link', { name: DEMO_FACILITY_NAME }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(
      page.getByRole('heading', { level: 1, name: DEMO_FACILITY_NAME })
    ).toBeVisible();
  });

  test('7. l’accueil ne présente aucune violation d’accessibilité grave', async ({
    page
  }) => {
    await page.goto('/');
    const violations = await analyzeAccessibility(page);
    const serious = violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
});
