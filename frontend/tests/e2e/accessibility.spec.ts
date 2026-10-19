import { expect, test } from '@playwright/test';
import {
  DEMO_DOCTOR_EMAIL,
  DEMO_PASSWORD,
  STRONG_PASSWORD,
  analyzeAccessibility,
  loginViaUi,
  registerPatientViaUi,
  uniqueEmail
} from './helpers';

function describeViolations(
  violations: Awaited<ReturnType<typeof analyzeAccessibility>>
): string {
  return violations
    .map(
      (violation) =>
        `- ${violation.id} [${violation.impact ?? 'n/a'}] ×${violation.nodes} : ${violation.help}`
    )
    .join('\n');
}

test.describe('Accessibilité (axe-core, WCAG 2.1 A/AA)', () => {
  test('page d’accueil sans violation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const violations = await analyzeAccessibility(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test('page de connexion sans violation', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    const violations = await analyzeAccessibility(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test('page de recherche sans violation', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const violations = await analyzeAccessibility(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test('fiche d’établissement sans violation', async ({ page, request }) => {
    const list = await request.get('/api/facilities?q=Palmiers');
    const data = (await list.json()) as { items: { id: string }[] };
    test.skip(data.items.length === 0, 'aucun établissement de démonstration');
    await page.goto(`/facilities/${data.items[0].id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const violations = await analyzeAccessibility(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test('tableau de bord patient sans violation', async ({ page }) => {
    const email = uniqueEmail('a11y');
    await registerPatientViaUi(page, email);
    await loginViaUi(page, email, STRONG_PASSWORD);
    await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    const violations = await analyzeAccessibility(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test('espace praticien (mes affiliations) sans violation', async ({ page }) => {
    await loginViaUi(page, DEMO_DOCTOR_EMAIL, DEMO_PASSWORD);
    await page.goto('/dashboard/affiliations');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mes affiliations' })
    ).toBeVisible();
    const violations = await analyzeAccessibility(page);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  test('lien d’évitement accessible au clavier', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Aller au contenu principal' });
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
