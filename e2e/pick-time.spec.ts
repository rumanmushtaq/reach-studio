import path from 'node:path';
import { expect, test } from '@playwright/test';
import { signIn } from './sign-in';

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);
const pktDate = (ms: number) => new Date(ms + 5 * 3600_000).toISOString().slice(0, 10);

test('pick a date and time when adding, then move it on the video page', async ({ page }) => {
  await signIn(page);

  const in3days = pktDate(Date.now() + 3 * 86400_000);
  const [y, m, d] = in3days.split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');

  await page.goto('/upload');
  await page.getByLabel(/Pick date and time/).check();
  await page.fill('#add-date', in3days);
  await page.selectOption('#add-time', '20:15');
  await expect(page.locator('[role=status]').filter({ hasText: 'Free: goes live' })).toContainText(`${label} 8:15 PM`);
  await page.setInputFiles('input[type=file]', fixture('rain-song-short.webm'));
  const job = page.locator('.job').first();
  await expect(job).toContainText(`${label} 8:15 PM`, { timeout: 300_000 });

  // The same time cannot be picked twice.
  await page.reload();
  await page.getByLabel(/Pick date and time/).check();
  await page.fill('#add-date', in3days);
  await page.selectOption('#add-time', '20:15');
  await expect(page.locator('[role=status]').filter({ hasText: 'already posting' })).toBeVisible();

  // Move it on its page to 9:30 PM the same day, then Undo.
  await page.goto('/library');
  await page.locator('.lib-row', { hasText: `${label} 8:15 PM` }).click();
  await expect(page.getByRole('heading', { name: 'When' })).toBeVisible();
  await page.getByRole('button', { name: 'Pick a time…' }).click();
  await page.fill('#move-date', in3days);
  await page.selectOption('#move-time', '21:30');
  await page.getByRole('button', { name: 'Move here' }).click();
  await expect(page.locator('.when-card')).toContainText(`${label} 9:30 PM`);
  await page.locator('.toast button', { hasText: 'Undo' }).click();
  await expect(page.locator('.when-card')).toContainText(`${label} 8:15 PM`);
});
