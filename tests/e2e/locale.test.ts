import { expect, test } from '@playwright/test';

// #36: the language in the address wins over the language cookie of an earlier visit.

const cookie = { name: 'PARAGLIDE_LOCALE', value: 'de', url: 'http://localhost:4173' };

test('a link to /en/… opens in English although the cookie says German', async ({
	page,
	context
}) => {
	await context.addCookies([cookie]);
	await page.goto('/en/search');
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	// still English once the page runs in the browser, which reads the cookie itself
	await page.waitForLoadState('networkidle');
	await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Hilfe' })).toHaveCount(0);
	const cookies = await context.cookies();
	expect(cookies.find((c) => c.name === cookie.name)?.value).toBe('en');
});

test('a search sent from /en/… with a German cookie still returns entries', async ({
	page,
	context
}) => {
	await context.addCookies([cookie]);
	await page.goto('/en/search');
	await context.clearCookies();
	await context.addCookies([cookie]);
	await page.locator('input[name=searchstring]').fill('Hodel');
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(page.locator('[data-testid=entry]')).toHaveCount(20);
});

test('an address without a language still follows the cookie', async ({ page, context }) => {
	await context.addCookies([{ ...cookie, value: 'fr' }]);
	await page.goto('/search');
	await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});
