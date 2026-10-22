import { defineConfig } from '@playwright/test';

const webPort = process.env.PROJECT_E2E_PORT ?? '1420';
const webUrl = `http://127.0.0.1:${webPort}`;
const browserExecutable = process.env.PROJECT_E2E_BROWSER_PATH;

export default defineConfig({
  testDir: './tests/browser',
  outputDir: '.cache/playwright-results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: webUrl,
    viewport: { width: 420, height: 600 },
    ...(browserExecutable !== undefined
      ? { launchOptions: { executablePath: browserExecutable } }
      : process.platform === 'win32'
        ? { channel: 'msedge' }
        : {}),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  ...(process.env.PROJECT_E2E_EXTERNAL_SERVER === '1'
    ? {}
    : {
        webServer: {
          command: `npm run dev -- --port ${webPort} --strictPort`,
          url: webUrl,
          reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
          timeout: 30_000,
        },
      }),
});
