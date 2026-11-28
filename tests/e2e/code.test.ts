import { expect, test, type APIRequestContext } from '@playwright/test';
import { openSearch } from './helpers.ts';

// Limit a search to a network group by its area code, for searches from 1930 on (#50), against the fixture
// database: 19 entries of Genève carry "022" in 1938; the entries of Genève of other years get it from the place.

async function search(request: APIRequestContext, form: Record<string, string>) {
	const response = await request.post('/search?/search', {
		form,
		headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' }
	});
	const body = await response.json();
	const values = body.type === 'success' ? (JSON.parse(String(body.data)) as unknown[]) : [];
	const result = values.find((v) => typeof v === 'object' && v !== null && 'results' in v) as
		Record<string, number> | undefined;
	const rows = result ? (values[result.results] as number[]).map((i) => values[i]) : [];
	const years = (rows as Record<string, number>[]).map((row) => values[row.year] as number);
	return { status: body.status as number, years };
}

test('the field is offered only for searches that start in 1930 or later', async ({ page }) => {
	await openSearch(page);
	await expect(page.getByTestId('code')).toHaveCount(0);
	await expect(page.getByTestId('code-hint')).toContainText('Ab 1930');
	await page.locator('input[name=from]').fill('1930');
	await page.locator('input[name=from]').blur();
	await expect(page.getByTestId('code')).toBeVisible();
	await expect(page.getByTestId('code-hint')).toHaveCount(0);
	// the code, its largest place and its entries in the years searched
	await expect(page.getByTestId('code').locator('option')).toHaveText(['alle', '022 Genève (31)']);
	// the form says how many entries of these years carry a code
	await expect(page.getByTestId('code-note')).toContainText(/^\d+ % der Einträge dieser Jahre/);
	// fewer years, fewer entries
	await page.locator('input[name=from]').fill('1938');
	await page.locator('input[name=from]').blur();
	await expect(page.getByTestId('code').locator('option').nth(1)).toHaveText('022 Genève (19)');
	// back before 1930: the field goes
	await page.locator('input[name=from]').fill('1929');
	await page.locator('input[name=from]').blur();
	await expect(page.getByTestId('code')).toHaveCount(0);
});

test('a search limited to a code finds the entries that carry it and those of its places', async ({
	page
}) => {
	await openSearch(page);
	await page.locator('input[name=from]').fill('1930');
	await page.locator('input[name=from]').blur();
	await page.getByTestId('code').selectOption('022');
	await page.locator('input[name=locality]').fill('Gen');
	await page.locator('input[name=locality]').press('Enter');
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 31');
});

test('entries of years without a printed code get the code of their place', async ({ request }) => {
	const { years } = await search(request, {
		locality: 'Gen',
		from: '1930',
		to: '1950',
		code: '022'
	});
	expect(years.length).toBe(31);
	expect(years.filter((year) => year === 1938).length).toBe(19);
	expect(years.some((year) => year < 1938)).toBe(true);
	// another code finds none of them
	expect(
		(await search(request, { locality: 'Gen', from: '1930', to: '1950', code: '031' })).years
	).toEqual([]);
});

test('refuses a code for years before 1930, and what is no code', async ({ request }) => {
	expect(
		(await search(request, { locality: 'Gen', from: '1920', to: '1950', code: '022' })).status
	).toBe(400);
	expect(
		(await search(request, { locality: 'Gen', from: '1930', to: '1950', code: '22' })).status
	).toBe(400);
});
