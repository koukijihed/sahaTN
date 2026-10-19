import { expect, test, type Page } from '@playwright/test';
import {
  STRONG_PASSWORD,
  loginViaUi,
  registerPatientViaUi,
  uniqueEmail
} from './helpers';

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow, 'débordement horizontal détecté').toBeLessThanOrEqual(1);
}

test.describe('Affichage mobile (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('l’en-tête utilise un menu repliable', async ({ page }) => {
    await page.goto('/');

    const toggle = page.getByRole('button', { name: 'Menu' });
    await expect(toggle).toBeVisible();
    const primaryNav = page.getByRole('navigation', {
      name: 'Navigation principale'
    });
    await expect(
      primaryNav.getByRole('link', { name: 'Recherche' })
    ).toBeHidden();

    await toggle.click();
    await expect(
      page.getByRole('button', { name: 'Fermer' })
    ).toBeVisible();
    await expect(
      primaryNav.getByRole('link', { name: 'Recherche' })
    ).toBeVisible();

    await primaryNav.getByRole('link', { name: 'Établissements' }).click();
    await expect(page).toHaveURL(/\/facilities$/);
  });

  test('aucun débordement horizontal sur les pages clés', async ({ page }) => {
    for (const path of ['/', '/search', '/login']) {
      await page.goto(path);
      await expect(page.locator('body')).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
  });

  test('l’espace connecté s’adapte au mobile', async ({ page }) => {
    const email = uniqueEmail('mobile');
    await registerPatientViaUi(page, email);
    await loginViaUi(page, email, STRONG_PASSWORD);

    const sidebar = page.getByRole('navigation', {
      name: "Navigation de l'espace connecté"
    });
    await expect(
      sidebar.getByRole('link', { name: /Mon dossier médical/ })
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Affichage bureau (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('la navigation est visible sans menu repliable', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    const primaryNav = page.getByRole('navigation', {
      name: 'Navigation principale'
    });
    await expect(
      primaryNav.getByRole('link', { name: 'Recherche' })
    ).toBeVisible();
    await expect(
      primaryNav.getByRole('link', { name: 'Établissements' })
    ).toBeVisible();
  });
});
