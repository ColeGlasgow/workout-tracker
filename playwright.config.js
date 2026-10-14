import { defineConfig, devices } from '@playwright/test';

// Runs the real page from public/ on a phone-sized iPhone (WebKit) and Android (Chromium).
export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block', trace: 'retain-on-failure' },
  projects: [
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'android', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: 'python3 -m http.server 4173 --directory public', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI },
});
