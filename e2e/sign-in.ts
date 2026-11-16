import { expect, type Page } from '@playwright/test';

export const OWNER = { name: 'Test Owner', email: 'owner@reach.test', password: 'cartoon-time-42' };

/** Signs in, creating the account first on a fresh studio. */
export async function signIn(page: Page) {
  await page.goto('/login');
  const create = page.getByRole('button', { name: 'Create account' });
  const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
  await expect(create.or(signInButton)).toBeVisible();
  if (await create.isVisible()) {
    await page.locator('#name').fill(OWNER.name);
    await page.locator('#email').fill(OWNER.email);
    await page.locator('#password').fill(OWNER.password);
    await page.locator('#confirm').fill(OWNER.password);
    await create.click();
  } else {
    await page.locator('#email').fill(OWNER.email);
    await page.locator('#password').fill(OWNER.password);
    await signInButton.click();
  }
  await expect(page.getByRole('link', { name: 'Today' }).first()).toBeVisible();
}
