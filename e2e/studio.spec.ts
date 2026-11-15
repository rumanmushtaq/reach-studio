import path from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);

test('add videos, get SEO and slots, move one, change settings', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.fill('#password', process.env.STUDIO_PASSWORD ?? 'test-pass-1234');
  await page.click('button:has-text("Sign in")');
  await expect(page.getByRole('heading', { name: 'Videos' })).toBeVisible();

  await page.fill('#addnote', 'Leo finds a magic lamp in the old bazaar');
  await page.setInputFiles('input[type=file]', [fixture('leo_magic_lamp.webm'), fixture('rain-song-short.webm')]);
  const leo = page.locator('.vrow', { hasText: 'Leo Magic Lamp' });
  const rain = page.locator('.vrow', { hasText: 'Rain Song Short' });
  await expect(leo.locator('.pill')).toHaveText('Scheduled', { timeout: 90_000 });
  await expect(rain.locator('.pill')).toHaveText('Scheduled', { timeout: 90_000 });
  await page.screenshot({ path: 'test-results/videos.png', fullPage: true });

  // Detail: SEO is there, shape detected, platforms default from shape.
  await leo.click();
  await expect(page.locator('#f-youtube-title')).toHaveValue(/Leo Magic Lamp/);
  await expect(page.getByText('Horizontal ·')).toBeVisible();
  await expect(page.getByLabel('Instagram')).not.toBeChecked();
  await page.fill('#f-youtube-title', 'Leo ka Jadui Chiragh | Urdu Cartoon');
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.locator('#f-youtube-title')).toHaveValue('Leo ka Jadui Chiragh | Urdu Cartoon');
  await page.screenshot({ path: 'test-results/detail.png', fullPage: true });

  // Calendar: tap a video, tap a free slot.
  await page.goto('/calendar');
  const booked = page.locator('.slot.booked', { hasText: 'Leo Magic Lamp' });
  const before = await booked.locator('.tm').textContent();
  await booked.click();
  await page.locator('.slot.free').last().click();
  await expect(page.locator('.toast')).toContainText('moved to');
  await page.screenshot({ path: 'test-results/calendar.png', fullPage: true });

  // Settings: add a daily time; Free slots shows it.
  await page.goto('/settings');
  await page.selectOption('select[aria-label="New daily time"]', '12:00');
  await page.click('button:has-text("Add daily time")');
  await expect(page.locator('.chip', { hasText: '12:00 PM' })).toBeVisible();
  await page.goto('/free-slots');
  await expect(page.locator('.frow', { hasText: '12:00 PM' }).first()).toBeVisible();

  // Accounts page renders and the job runner answers.
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'TikTok' })).toBeVisible();
  const tick = await request.get('/api/cron/tick', { headers: { authorization: 'Bearer local-cron-secret' } });
  expect(tick.status()).toBe(200);
  expect(await request.get('/api/cron/tick').then((r) => r.status())).toBe(401);
  expect(before).toBeTruthy();
});
