import path from 'node:path';
import { expect, test } from '@playwright/test';

const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);
const pktDate = (ms: number) => new Date(ms + 5 * 3600_000).toISOString().slice(0, 10);

test('pick a date and time when adding a video, then move it to another picked time', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#password', process.env.STUDIO_PASSWORD ?? 'test-pass-1234');
  await page.click('button:has-text("Sign in")');
  await expect(page.getByRole('heading', { name: 'Videos' })).toBeVisible();

  const in3days = pktDate(Date.now() + 3 * 86400_000);
  const [y, m, d] = in3days.split('-').map(Number);
  const label = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');

  await page.getByLabel('Pick date and time').check();
  await page.fill('#add-date', in3days);
  await page.selectOption('#add-time', '20:15');
  await expect(page.locator('#addcard [role=status]')).toContainText(`${label} 8:15 PM`);
  await page.setInputFiles('input[type=file]', fixture('rain-song-short.webm'));

  const row = page.locator('.vrow', { hasText: 'Rain Song Short' }).last();
  await expect(row).toContainText(`${label} 8:15 PM`);
  await expect(row.locator('.pill')).toHaveText('Scheduled');
  await page.screenshot({ path: 'test-results/pick-add.png', fullPage: true });

  // The same time cannot be picked twice.
  await page.getByLabel('Pick date and time').check();
  await page.fill('#add-date', in3days);
  await page.selectOption('#add-time', '20:15');
  await expect(page.locator('#addcard [role=status]')).toContainText('Rain Song Short is already posting at this time.');

  // Move it on its page to 9:30 PM the same day.
  await row.click();
  await expect(page.getByRole('heading', { name: 'Posting slot' })).toBeVisible();
  await page.getByLabel('Pick date and time').check();
  await page.fill('#move-date', in3days);
  await page.selectOption('#move-time', '21:30');
  await page.click('button:has-text("Move")');
  await expect(page.locator('.kv')).toContainText(`${label} 9:30 PM`);
  await page.screenshot({ path: 'test-results/pick-move.png', fullPage: true });
});
