import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export const DEMO_PASSWORD = 'DemoPassw0rd!2024';
export const DEMO_DOCTOR_EMAIL = 'demo.doctor@sahatn.example';
export const DEMO_STAFF_EMAIL = 'demo.staff@sahatn.example';
export const ADMIN_EMAIL =
  process.env.BROWSER_ADMIN_EMAIL || 'admin.browser@sahatn.example';
export const ADMIN_PASSWORD =
  process.env.BROWSER_ADMIN_PASSWORD || 'AdminPassw0rd!2024';

export const STRONG_PASSWORD = 'PatientPassw0rd!23';
export const DEMO_FACILITY_NAME = 'Polyclinique Les Palmiers';
export const STAFF_FACILITY_NAME = 'Hôpital universitaire Jabal Al-Fikr';

let counter = 0;
export function uniqueEmail(prefix = 'patient'): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}@example.tn`;
}

export async function registerPatientViaUi(
  page: Page,
  email: string,
  password = STRONG_PASSWORD
): Promise<void> {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: /Créer un compte patient/i })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function loginViaUi(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

export async function logoutViaUi(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL(/\/$/);
}

export interface AxeViolation {
  id: string;
  impact: string | null | undefined;
  help: string;
  nodes: number;
}

export async function analyzeAccessibility(
  page: Page,
  options: { include?: string; disableRules?: string[] } = {}
): Promise<AxeViolation[]> {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa'
  ]);
  if (options.include) {
    builder = builder.include(options.include);
  }
  if (options.disableRules?.length) {
    builder = builder.disableRules(options.disableRules);
  }
  const results = await builder.analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.length
  }));
}
