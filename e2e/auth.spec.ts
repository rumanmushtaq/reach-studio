import { expect, test } from '@playwright/test';
import { OWNER, signIn } from './sign-in';

const SETUP_CODE = process.env.CRON_SECRET ?? 'local-cron-secret';

test('create the account, sign out, wrong password, reset with the setup code, change password', async ({ page, browser }) => {
  // Fresh studio: the sign-in page asks to create the account, and checks the form before sending it.
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await page.locator('#password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your name')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
  await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true');
  // Another browser opens the create form before the account exists.
  const other = await browser.newContext();
  const stale = await other.newPage();
  await stale.goto('/login');
  await expect(stale.getByRole('button', { name: 'Create account' })).toBeVisible();
  await signIn(page);

  // The stale form, sent after the account exists, lands on sign-in instead of an error.
  await stale.locator('#name').fill('Someone Else');
  await stale.locator('#email').fill('else@reach.test');
  await stale.locator('#password').fill('another-pass-42');
  await stale.locator('#confirm').fill('another-pass-42');
  if (await stale.locator('#code').count()) await stale.locator('#code').fill(SETUP_CODE);
  await stale.getByRole('button', { name: 'Create account' }).click();
  await expect(stale.getByText('Your account already exists. Sign in with it.')).toBeVisible();
  await expect(stale.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await other.close();

  // Sign out: now it is a normal sign-in page.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);

  // A wrong password says so without saying which part was wrong.
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill('not-my-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Wrong email or password.')).toBeVisible();

  // Forgot password: a wrong setup code is refused, the right one sets a new password.
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#code').fill('wrong-code');
  await page.locator('#password').fill('brand-new-pass-7');
  await page.locator('#confirm').fill('brand-new-pass-7');
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('The email or the setup code is wrong.')).toBeVisible();
  await page.locator('#code').fill(SETUP_CODE);
  await page.getByRole('button', { name: 'Set new password' }).click();
  await expect(page.getByText('Password changed. Sign in with the new one.')).toBeVisible();
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill('brand-new-pass-7');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Today' }).first()).toBeVisible();

  // Settings: change it back, so the other tests sign in with the usual password.
  await page.goto('/settings');
  await page.locator('#pw-current').fill('brand-new-pass-7');
  await page.locator('#pw-new').fill(OWNER.password);
  await page.locator('#pw-confirm').fill('typo-pass-123');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('The passwords do not match')).toBeVisible();
  await page.locator('#pw-confirm').fill(OWNER.password);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed', { exact: true })).toBeVisible();
});
