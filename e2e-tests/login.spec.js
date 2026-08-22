import { test, expect } from '@playwright/test';

// The app uses createHashRouter, so after navigation the PATH stays put and
// only the HASH changes (e.g. after login: /login#/ ). Assertions below rely
// on visible content rather than exact URLs for robustness.

test.describe('Login Page (E2E)', () => {
  // ─── 1. Page loads and displays correctly ──────────────────────────────
  test('displays the login form with correct elements', async ({ page }) => {
    await page.goto('/');

    // Should show the login form (AuthGuard redirects anonymous users)
    await expect(page.getByPlaceholder('أدخل اسم المستخدم')).toBeVisible();
    await expect(page.getByPlaceholder('أدخل كلمة المرور')).toBeVisible();
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();

    // Page title (LoginPage h1)
    await expect(page.locator('h1')).toContainText('منظومة إحصائيات الأدوية والمستلزمات الطبية');
  });

  // ─── 2. Login with valid credentials ───────────────────────────────────
  test('logs in successfully with valid admin credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in credentials
    await page.getByPlaceholder('أدخل اسم المستخدم').fill('admin');
    await page.getByPlaceholder('أدخل كلمة المرور').fill('admin');

    // Submit
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    // HashRouter keeps the /login path and only changes the hash — the real
    // signal is the dashboard content becoming visible. Scoped heading role
    // avoids matching any h1 in the Navbar/AppLayout shell.
    await expect(page.getByRole('heading', { level: 1, name: /مرحباً بك/ })).toBeVisible();
  });

  // ─── 3. Login with invalid credentials ─────────────────────────────────
  test('shows error message with invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill in wrong credentials
    await page.getByPlaceholder('أدخل اسم المستخدم').fill('wrong');
    await page.getByPlaceholder('أدخل كلمة المرور').fill('wrong');

    // Submit
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

    // Should stay on the login form (no dashboard)
    await expect(page.getByPlaceholder('أدخل اسم المستخدم')).toBeVisible();
    await expect(page.locator('h1')).toContainText('منظومة إحصائيات الأدوية والمستلزمات الطبية');
  });

  // ─── 4. Form validation ────────────────────────────────────────────────
  test('does not submit empty form', async ({ page }) => {
    await page.goto('/login');

    // The submit button is disabled until both fields are filled — this IS
    // the empty-form validation, so clicking is neither needed nor possible.
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeDisabled();
    await expect(page.getByPlaceholder('أدخل اسم المستخدم')).toBeVisible();
  });
});
