import { expect, test } from '@playwright/test';

// #25: a page that says which volumes are in the database and how much of each.

test('the coverage page lists every volume of the database', async ({ page }) => {
	await page.goto('/coverage');
	await expect(page.getByRole('heading', { name: 'Was ist durchsuchbar?' })).toBeVisible();
	await expect(page.getByTestId('summary')).toContainText('1880 bis 1950');
	const first = page.getByTestId('volume').first();
	await expect(first).toContainText('1880');
	await expect(first).toContainText('Zuerich');
	await expect(first).toContainText('99');
	await expect(first).toContainText('ja');
	// 1938–1950 before the re-reading: text only
	const late = page
		.getByTestId('volume')
		.filter({ hasText: /^\s*1945/ })
		.first();
	await expect(late).toContainText('nur Volltext');
});

test('it names the volume that is in the catalogue but not in the database', async ({ page }) => {
	await page.goto('/coverage');
	// the fixture holds only a few volumes, so the list is long here; these two tell the cases apart
	await expect(page.getByTestId('missing')).toContainText('P-260-1_1_1931');
	// in the fixture, and in the catalogue under two spellings of its name
	await expect(page.getByTestId('missing')).not.toContainText('Gen\u00e8ve_1902');
});

test('the header leads to it, in the language of the page', async ({ page }) => {
	await page.goto('/en/search');
	await page.getByRole('link', { name: 'Coverage' }).click();
	await expect(page).toHaveURL(/\/en\/coverage$/);
	await expect(page.getByRole('heading', { name: 'What can be searched?' })).toBeVisible();
});
