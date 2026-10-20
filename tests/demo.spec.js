const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('networkidle');
});

test('sign-in screen shows Try demo button', async ({ page }) => {
  await expect(page.getByText('Sign in with Google')).toBeVisible();
  await expect(page.getByTestId('try-demo-btn')).toBeVisible();
  await expect(page.getByTestId('try-demo-btn')).toHaveText('Try demo — no account needed');
});

test('demo mode loads dashboard with contacts', async ({ page }) => {
  await page.getByTestId('try-demo-btn').click();

  // Wait for syncing animation to finish and dashboard to appear
  await expect(page.getByRole('button', { name: 'All Contacts' })).toBeVisible({ timeout: 10000 });

  // Verify known demo contacts are present
  await expect(page.getByText('Priya Shah')).toBeVisible();
  await expect(page.getByText('Alex Novak')).toBeVisible();
  await expect(page.getByText('Maya Okafor')).toBeVisible();
});

test('demo mode shows demo indicator in sidebar', async ({ page }) => {
  await page.getByTestId('try-demo-btn').click();

  await expect(page.getByRole('button', { name: 'All Contacts' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Demo mode')).toBeVisible();
});

test('exiting demo reloads to sign-in screen', async ({ page }) => {
  await page.getByTestId('try-demo-btn').click();

  await expect(page.getByRole('button', { name: 'All Contacts' })).toBeVisible({ timeout: 10000 });

  // Click Exit in the demo banner
  await page.getByRole('button', { name: 'Exit' }).click();

  // Should return to sign-in screen after reload
  await expect(page.getByText('Sign in with Google')).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId('try-demo-btn')).toBeVisible();
});
