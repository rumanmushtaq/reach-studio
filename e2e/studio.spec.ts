import path from 'node:path';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);


test('add videos, see them on Today, edit SEO, move with undo, settings, library', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Add videos' }).first().click();
  await expect(page.getByRole('heading', { name: 'Add videos' })).toBeVisible();
  await page.setInputFiles('input[type=file]', [fixture('leo_magic_lamp.webm'), fixture('rain-song-short.webm')]);
  await expect(page.locator('.job a:has-text("Open")')).toHaveCount(2, { timeout: 300_000 });
  await expect(page.getByRole('heading', { name: '2 videos · 2 ready' })).toBeVisible();
  await page.screenshot({ path: 'test-results/upload.png', fullPage: true });

  // Today shows both, grouped by day, with per-platform chips.
  await page.getByRole('link', { name: 'Done' }).click();
  const leo = page.locator('a.slot', { hasText: 'Leo Magic Lamp' });
  await expect(leo).toBeVisible();
  await expect(page.locator('a.slot', { hasText: 'Rain Song Short' }).first()).toBeVisible();
  await expect(leo.locator('.chip')).toHaveCount(2); // long horizontal video: YouTube and Facebook only
  await expect(page.getByRole('heading', { name: /Needs you/ })).toBeVisible(); // nothing is connected yet
  await page.screenshot({ path: 'test-results/today.png', fullPage: true });

  // Video page: preview, checklist, editor with tags.
  await leo.click();
  await expect(page.getByRole('heading', { name: 'Reach checklist' })).toBeVisible();
  await expect(page.locator('#f-youtube-title')).toHaveValue(/Leo Magic Lamp/);
  await expect(page.getByLabel('Post to Instagram')).not.toBeChecked();
  await page.fill('#f-youtube-title', 'Leo ka Jadui Chiragh | Urdu Cartoon');
  await page.fill('#f-youtube-tags', 'jadui chiragh');
  await page.press('#f-youtube-tags', 'Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await page.reload();
  await expect(page.locator('#f-youtube-title')).toHaveValue('Leo ka Jadui Chiragh | Urdu Cartoon');
  await expect(page.locator('.tag', { hasText: 'jadui chiragh' })).toBeVisible();
  await page.getByRole('tab', { name: /Facebook/ }).click();
  await expect(page.getByRole('heading', { name: 'Facebook text' })).toBeVisible();
  await page.screenshot({ path: 'test-results/video.png', fullPage: true });

  // Planner: tap a video, tap a free slot, then Undo.
  await page.goto('/calendar');
  const booked = page.locator('.wcell.booked', { hasText: 'Leo Magic Lamp' });
  const before = await booked.getAttribute('aria-label');
  await booked.click();
  await page.locator('.wcell.free').last().click();
  await expect(page.locator('.toast')).toContainText('Moved Leo Magic Lamp');
  await page.screenshot({ path: 'test-results/planner.png', fullPage: true });
  await page.locator('.toast button', { hasText: 'Undo' }).click();
  await expect(page.locator('.wcell.booked', { hasText: 'Leo Magic Lamp' })).toHaveAttribute('aria-label', before!);

  // Settings: add a daily time.
  await page.goto('/settings');
  await page.selectOption('select[aria-label="New daily time"]', '12:00');
  await page.click('button:has-text("Add daily time")');
  await expect(page.locator('.timechip', { hasText: '12:00 PM' })).toBeVisible();
  // Channel form: a half link is caught next to its field, a full one saves.
  await page.fill('#s-channel', 'Leo Cartoons');
  await page.fill('#l-youtube', 'youtube');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Paste the full link, starting with https://')).toBeVisible();
  await page.fill('#l-youtube', 'https://youtube.com/@leo');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Saved');
  await page.reload();
  await expect(page.locator('#l-youtube')).toHaveValue('https://youtube.com/@leo');

  // Library: filter and search.
  await page.goto('/library');
  await expect(page.locator('.lib-row', { hasText: 'Leo Magic Lamp' })).toBeVisible();
  await page.fill('input[type=search]', 'leo');
  await expect(page.locator('.lib-row')).toHaveCount(1);

  // Accounts: setup checklist; old Free slots link goes to the planner.
  await page.goto('/accounts');
  await expect(page.getByRole('heading', { name: 'Setup' })).toBeVisible();
  await page.goto('/free-slots');
  await expect(page).toHaveURL(/\/calendar$/);
});

test('job runner needs its secret', async ({ request }) => {
  expect((await request.get('/api/cron/tick')).status()).toBe(401);
  expect((await request.get('/api/cron/tick', { headers: { authorization: 'Bearer local-cron-secret' } })).status()).toBe(200);
});
