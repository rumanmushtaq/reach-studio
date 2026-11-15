import { defineConfig } from '@playwright/test';

// Runs against a dev server you start yourself (npm run dev) on an empty ./data folder.
// One worker: the laptop has little memory.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 400_000,
  expect: { timeout: 90_000 }, // dev server compiles each page on first visit
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3100',
    viewport: { width: 1280, height: 900 },
    // Reuse an already-downloaded browser when set (e.g. PW_CHROMIUM=~/.cache/ms-playwright/.../chrome-headless-shell).
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
});
