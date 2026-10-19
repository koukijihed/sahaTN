import { defineConfig, devices } from '@playwright/test';

// SahaTN - configuration des tests navigateur (Jour 14).
//
// Prerequis :
//   1. Backend compile :  (cd backend ; npm run build)
//   2. Frontend compile : (cd frontend ; npm run build)
// Playwright demarre lui-meme le backend (base ephemere + donnees fictives) et
// le frontend de production, puis lance les tests contre des donnees fictives.
// Aucune donnee reelle n'est utilisee.
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT || 3100);
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT || 4000);
const baseURL = `http://localhost:${FRONTEND_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: `"${process.execPath}" test/browser/start-server.mjs`,
      cwd: '../backend',
      env: {
        BROWSER_API_PORT: String(BACKEND_PORT),
        CORS_ORIGIN: baseURL
      },
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: `"${process.execPath}" node_modules/next/dist/bin/next start -p ${FRONTEND_PORT}`,
      cwd: '.',
      env: {
        API_URL: `http://localhost:${BACKEND_PORT}`,
        PORT: String(FRONTEND_PORT)
      },
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ]
});
