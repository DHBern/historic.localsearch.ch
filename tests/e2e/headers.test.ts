import { expect, test } from '@playwright/test';

// #30: every page carries a Content-Security-Policy and the other security headers,
// and the policy does not get in the way of the page itself.

test('pages carry the security headers', async ({ request }) => {
	for (const path of ['/', '/search', '/en/search']) {
		const headers = (await request.get(path)).headers();
		const csp = headers['content-security-policy'];
		expect(csp, path).toContain("default-src 'self'");
		expect(csp, path).toContain("frame-ancestors 'none'");
		expect(csp, path).toMatch(/script-src 'self' 'nonce-[^']+'/);
		expect(csp, path).not.toContain('unsafe-inline');
		expect(csp, path).not.toContain('unsafe-eval');
		expect(headers['x-content-type-options'], path).toBe('nosniff');
		expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
		expect(headers['x-frame-options'], path).toBe('DENY');
	}
});

test('the policy blocks nothing the pages need', async ({ page }) => {
	const blocked: string[] = [];
	page.on('console', (message) => {
		if (/Content Security Policy/i.test(message.text())) blocked.push(message.text());
	});
	await page.goto('/');
	await page.goto('/search');
	await page.locator('input[name=searchstring]').fill('Hodel');
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(page.getByTestId('thumbnail').first()).toBeVisible();
	await page.getByRole('button', { name: 'Hilfe' }).click();
	await page.waitForTimeout(500);
	expect(blocked).toEqual([]);
});
