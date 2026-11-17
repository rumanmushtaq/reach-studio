import { expect, test } from '@playwright/test';
import { mailCount, newestLink, totp } from './mail';
import { OWNER } from './sign-in';

// The whole sign-in workflow on Supabase Auth (local server from e2e/supabase/compose.yml):
// register → confirm email → profile → sign in → wrong password → forgot password → reset link →
// new password signs out everywhere → 2-step code → change password → sign out.

const NEW_PASSWORD = 'brand-new-pass-7';
const THIRD_PASSWORD = 'third-pass-word-9';

test('register, confirm, sign in, forgot password, 2-step code, change password', async ({ page, browser }) => {
  // Fresh studio: the sign-in page asks to create the account, and checks the form before sending it.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.locator('#password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your name')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters')).toBeVisible();
  await expect(page.locator('#password')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.rules li.met')).toHaveCount(1); // "a letter" is met

  // Another browser opens the create form before the account exists.
  const other = await browser.newContext();
  const stale = await other.newPage();
  await stale.goto('/login');
  await expect(stale.getByRole('button', { name: 'Create account' })).toBeVisible();

  // Register: Supabase signUp, then "check your inbox"; sending it again works.
  const mails = await mailCount(OWNER.email);
  await page.locator('#name').fill(OWNER.name);
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.locator('#confirm').fill(OWNER.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await expect(page.locator('.inbox-email')).toContainText(OWNER.email);
  await newestLink(OWNER.email, mails);

  // Not verified yet: signing in says so and offers to send the email again.
  await stale.reload();
  await expect(stale.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await stale.locator('#email').fill(OWNER.email);
  await stale.locator('#password').fill(OWNER.password);
  await stale.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(stale.getByText('Confirm your email first')).toBeVisible();
  // Supabase allows one email a minute per address: the page says how long to wait and counts down.
  await stale.getByRole('button', { name: 'Send the confirmation email again' }).click();
  await expect(stale.getByText(/We just sent an email\. Wait \d+ seconds/)).toBeVisible();
  await expect(stale.getByRole('button', { name: /Send the confirmation email again \(\d+s\)/ })).toBeDisabled();

  // The confirmation link opened in another browser still confirms the email; then you sign in.
  await stale.goto(await newestLink(OWNER.email, mails));
  await expect(stale.getByText('Email confirmed. Sign in with your email and password.')).toBeVisible();
  await other.close();
  await page.goto('/login');
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Today' }).first()).toBeVisible();

  // Sign out; signed-out pages send you to sign-in.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page.getByText('You signed out.')).toBeVisible();
  await page.goto('/library');
  await expect(page).toHaveURL(/\/login/);

  // A wrong password says so.
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill('not-my-password-1');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Wrong email or password.' })).toBeVisible();

  // Forgot password: only the email; an unknown one is caught next to the field.
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
  await expect(page.locator('form input')).toHaveCount(1);
  await page.locator('#email').fill('nobody@reach.test');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('No studio account uses this email.')).toBeVisible();
  const beforeReset = await mailCount(OWNER.email);
  await page.locator('#email').fill(OWNER.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();

  // The reset link opened in another browser cannot be used there.
  const resetLink = await newestLink(OWNER.email, beforeReset);
  const elsewhere = await browser.newContext();
  const away = await elsewhere.newPage();
  await away.goto(resetLink);
  await expect(away.getByText('Open the email link in the same browser')).toBeVisible();
  await elsewhere.close();

  // Ask again after Supabase's one-minute wait, open it here: set a new password, then every device is signed out.
  const beforeReset2 = await mailCount(OWNER.email);
  await page.getByRole('button', { name: 'Send the email again' }).click();
  await expect(page.getByText(/We just sent an email\. Wait \d+ seconds/)).toBeVisible();
  await page.waitForTimeout(61_000);
  await page.getByRole('button', { name: 'Send the email again' }).click();
  await expect(page.getByText('Sent again.')).toBeVisible();
  await page.goto(await newestLink(OWNER.email, beforeReset2));
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await page.locator('#password').fill(NEW_PASSWORD);
  await page.locator('#confirm').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password changed. Sign in with your new password.')).toBeVisible();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);

  // The old password no longer works; the new one does.
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(OWNER.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Wrong email or password.')).toBeVisible();
  await page.locator('#password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Today' }).first()).toBeVisible();

  // 2-step sign-in: scan, type a code, it is on.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Turn on 2-step sign-in' }).click();
  await expect(page.getByAltText('QR code for your authenticator app')).toBeVisible();
  const secret = (await page.locator('.twostep code').textContent())!.trim();
  await page.locator('#mfa-code').fill('000000');
  await page.getByRole('button', { name: 'Turn on', exact: true }).click();
  await expect(page.getByText('That code is wrong or too old.')).toBeVisible();
  await page.locator('#mfa-code').fill(totp(secret));
  await page.getByRole('button', { name: 'Turn on', exact: true }).click();
  await expect(page.locator('#twostep ~ .pill, .pill').filter({ hasText: 'On' })).toBeVisible();

  // Next sign-in: password, then the code.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.goto('/'); // the studio stays closed until the code is typed
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.locator('#code').fill('123');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByText('Type the 6-digit code from your authenticator app')).toBeVisible();
  await page.locator('#code').fill(totp(secret));
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('link', { name: 'Today' }).first()).toBeVisible();

  // With 2-step on, a reset link alone is not enough: the new-password page also asks for the code.
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  const beforeReset3 = await mailCount(OWNER.email);
  await page.locator('#email').fill(OWNER.email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
  await page.goto(await newestLink(OWNER.email, beforeReset3));
  await expect(page.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
  await page.goto('/'); // the studio itself stays closed without the code
  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.goBack();
  await page.goto('/reset-password');
  await page.locator('#password').fill(THIRD_PASSWORD);
  await page.locator('#confirm').fill(THIRD_PASSWORD);
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Type the 6-digit code from your authenticator app').first()).toBeVisible();
  await page.locator('#code').fill(totp(secret));
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByText('Password changed. Sign in with your new password.')).toBeVisible();
  await page.locator('#email').fill(OWNER.email);
  await page.locator('#password').fill(THIRD_PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('#code').fill(totp(secret, Date.now() + 30_000)); // a fresh code: the last one was just used
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('link', { name: 'Today' }).first()).toBeVisible();

  // Settings: change the password back (needs the current one), then turn 2-step off for the other tests.
  await page.goto('/settings');
  await page.locator('#pw-current').fill('wrong-current-1');
  await page.locator('#pw-new').fill(OWNER.password);
  await page.locator('#pw-confirm').fill(OWNER.password);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('That is not your current password')).toBeVisible();
  await page.locator('#pw-current').fill(THIRD_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.locator('.toast')).toContainText('Password changed');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Turn off' }).click();
  await expect(page.locator('.toast')).toContainText('2-step sign-in is off');
  await expect(page.getByRole('button', { name: 'Turn on 2-step sign-in' })).toBeVisible();
});
