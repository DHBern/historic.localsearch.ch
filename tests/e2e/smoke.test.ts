import { expect, test } from '@playwright/test';
import { openSearch } from './helpers.ts';

// What must never break again: the page starts in the browser (buttons work)
// and a search returns entries. The SvelteKit 3 upgrade broke both while
// build and type check stayed green.

test('start page has the search field and no script errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('historic.localsearch');
	await expect(page.locator('input[name=searchstring]')).toBeVisible();
	await page.waitForLoadState('networkidle');
	expect(errors).toEqual([]);
});

test('the help button opens the help text', async ({ page }) => {
	await openSearch(page);
	await page.getByRole('button', { name: 'Hilfe' }).click();
	await expect(page.getByRole('dialog')).toContainText('Suchstrategien');
	await page.getByRole('button', { name: 'OK' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a search from the start page shows entries', async ({ page }) => {
	await page.goto('/');
	await page.locator('input[name=searchstring]').fill('Hodel');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/search/);
	await expect(page.locator('[data-testid=entry]').first()).toBeVisible();
});

test('a full-text search works in place and lists entries by year', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=searchstring]').fill('Hodel');
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(page.locator('[data-testid=entry]')).toHaveCount(20);
	await expect(page.locator('[data-testid=year]').first()).toHaveText('1882');
	// in place: the field still holds the term, so the page was not reloaded
	await expect(page.locator('input[name=searchstring]')).toHaveValue('Hodel');
});

test('the button under the list shows more entries', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=searchstring]').fill('Hodel');
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(page.locator('[data-testid=entry]')).toHaveCount(20);
	await page.locator('[data-testid=more]').click();
	await expect(page.locator('[data-testid=entry]')).toHaveCount(40);
});

test('a search by name finds the first phone book of 1880', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=entityname1]').fill('Annoncenbureau');
	await page.locator('input[name=entityname1]').press('Enter');
	const first = page.locator('[data-testid=entry]').first();
	await expect(first).toContainText('Annoncenbureau Orell Füssli & Co.');
	await expect(first.getByRole('link', { name: 'P-260-1_Zuerich_1880' })).toHaveAttribute(
		'href',
		'https://mfk.rechercheonline.ch/de/research/records/pttarchiv:203934'
	);
});

test('the language switch changes the interface', async ({ page }) => {
	await openSearch(page);
	await page.getByRole('button', { name: 'en', exact: true }).click();
	await expect(page).toHaveURL(/\/en\/search/);
	await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
});

test('the about text says that the data are machine-generated', async ({ page }) => {
	await openSearch(page);
	await page.getByRole('button', { name: 'Über' }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog.getByRole('heading', { name: 'Maschinell erzeugte Daten' })).toBeVisible();
	await expect(dialog).toContainText('nicht Eintrag für Eintrag von Hand geprüft');
});
