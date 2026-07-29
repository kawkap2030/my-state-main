import { test, expect } from '@playwright/test';

test.describe('Login Page (E2E)', () => {
  // ─── 1. Page loads and displays correctly ──────────────────────────────
  test('displays the login form with correct elements', async ({ page }) => {
    await page.goto('/');
    
    // Should redirect to /login if not authenticated
    await expect(page).toHaveURL(/\/login/);
    
    // Check for key elements
    await expect(page.locator('h1')).toContainText('منظومة الإحصاء الطبي');
    await expect(page.getByPlaceholder('أدخل اسم المستخدم')).toBeVisible();
    await expect(page.getByPlaceholder('أدخل كلمة المرور')).toBeVisible();
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();
  });

  // ─── 2. Login with valid credentials ───────────────────────────────────
  test('logs in successfully with valid admin credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in credentials
    await page.getByPlaceholder('أدخل اسم المستخدم').fill('admin');
    await page.getByPlaceholder('أدخل كلمة المرور').fill('admin');
    
    // Submit
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    
    // Should redirect to dashboard
    await expect(page).toHaveURL(/^\/(#\/)?$/);
    
    // Should see the dashboard heading
    await expect(page.locator('h1').first()).toContainText('لوحة المعلومات');
  });

  // ─── 3. Login with invalid credentials ─────────────────────────────────
  test('shows error message with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill in wrong credentials
    await page.getByPlaceholder('أدخل اسم المستخدم').fill('wrong');
    await page.getByPlaceholder('أدخل كلمة المرور').fill('wrong');
    
    // Submit
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    
    // Should stay on login page
    await expect(page).toHaveURL(/\/login/);
  });

  // ─── 4. Form validation ────────────────────────────────────────────────
  test('does not submit empty form', async ({ page }) => {
    await page.goto('/login');
    
    // Click submit without filling in anything
    await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
    
    // Should stay on login page (no redirect)
    await expect(page).toHaveURL(/\/login/);
  });
});
