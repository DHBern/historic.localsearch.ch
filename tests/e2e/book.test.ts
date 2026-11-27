import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { openSearch } from './helpers.ts';

// Limit a search to a book (#50) and choose the order of the list (#23), against the fixture database.

const entries = (page: Page) => page.locator('[data-testid=entry]');

/** The value of a suggestion of the book field that starts with `start`. */
async function suggestion(page: Page, start: string) {
	const values = await page
		.locator('#book-list option')
		.evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
	const value = values.find((v) => v.startsWith(start));
	expect(value, `a suggestion that starts with "${start}" in ${values.join(' | ')}`).toBeTruthy();
	return value!;
}

async function search(request: APIRequestContext, form: Record<string, string>) {
	const response = await request.post('/search?/search', {
		form,
		headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' }
	});
	const body = await response.json();
	return { status: body.status as number, data: String(body.data) };
}

test('the book field suggests the books of both periods', async ({ page }) => {
	await openSearch(page);
	// until 1910 one book per network, with its years
	expect(await suggestion(page, 'Basel')).toBe('Basel (1903–1910)');
	// from 1911 the regional volumes, with what they cover and the years they exist for
	expect(await suggestion(page, 'Band 2:')).toBe(
		'Band 2: Bern, Basel, Aargau, Zentralschweiz, Tessin (1911–1950)'
	);
	expect(await suggestion(page, 'Band 2a')).toBe('Band 2a (1911–1920, 1947–1950)');
});

test('a search limited to a book of a network finds only its volumes', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=entityname1]').fill('Hodel');
	await page.locator('input[name=entityname1]').press('Enter');
	const all = await page.getByTestId('hit-count').textContent();
	await page.getByTestId('book').fill(await suggestion(page, 'Bern ('));
	await page.locator('input[name=entityname1]').press('Enter');
	// the fixture has 55 entries of the name in the books of Bern, four of them in "Bern / Val-de-Travers"
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 55');
	expect(all).not.toBe('Treffer: 55');
	await page.getByTestId('more').click();
	const files = await entries(page).locator('dd a[href*="rechercheonline"]').allTextContents();
	expect(files.length).toBeGreaterThan(20);
	expect(
		files.every((file) => /^P-260(-1)?_(Netzgruppe)?Bern(_ValdeTravers)?_\d{4}/.test(file.trim()))
	).toBe(true);
});

test('a book of two networks counts for both', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=entityname1]').fill('Hodel');
	await page.getByTestId('book').fill(await suggestion(page, 'Val-de-Travers'));
	await page.locator('input[name=entityname1]').press('Enter');
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 6');
});

test('a regional volume holds its parts a and b, and a part can be chosen alone', async ({
	request
}) => {
	const count = async (book: string) => {
		const { data } = await search(request, {
			entityname1: 'Hodel',
			from: '1911',
			to: '1920',
			book
		});
		const values = JSON.parse(data) as unknown[];
		const result = values.find(
			(v) => typeof v === 'object' && v !== null && 'results' in v
		) as Record<string, number>;
		return (values[result.results] as unknown[]).length;
	};
	const [whole, a, b] = [await count('2'), await count('2a'), await count('2b')];
	expect(a).toBeGreaterThan(0);
	expect(b).toBeGreaterThan(0);
	expect(whole).toBe(a + b);
});

test('the limit to a book also counts for the map', async ({ request }) => {
	const response = await request.post('/search?/map', {
		form: { entityname1: 'Hodel', book: 'Val-de-Travers' },
		headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' }
	});
	const values = JSON.parse(String((await response.json()).data)) as unknown[];
	const map = values.find((v) => typeof v === 'object' && v !== null && 'shown' in v) as Record<
		string,
		number
	>;
	expect(values[map.total]).toBe(6);
});

test('a text that is no book is not searched for', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=entityname1]').fill('Hodel');
	await page.getByTestId('book').fill('Bümpliz');
	await page.locator('input[name=entityname1]').press('Enter');
	await expect(page.getByTestId('book-unknown')).toContainText('Dieses Buch gibt es nicht');
	await expect(page.getByTestId('hit-count')).toHaveCount(0);
	// a name the table does not have finds nothing, also when it is sent past the form
});

test('a book sent past the form that does not exist finds nothing', async ({ request }) => {
	const { data } = await search(request, { entityname1: 'Hodel', book: 'Bümpliz' });
	expect(data).toContain('"total":');
	expect(data).not.toContain('Hodel');
	expect((await search(request, { entityname1: 'Hodel', sort: 'page' })).status).toBe(400);
});

test('the info button explains what a book is: on focus, and after a tap', async ({ page }) => {
	await openSearch(page);
	const info = page.getByTestId('book-info');
	await expect(info).toBeHidden();
	const button = page.getByTestId('book-info-button');
	await expect(button).toHaveAttribute('aria-describedby', 'book-info');
	await button.click();
	await expect(info).toBeVisible();
	await expect(info).toContainText('Bis 1910 hatte jedes Telefonnetz sein eigenes Buch');
	await expect(button).toHaveAttribute('aria-expanded', 'true');
	await button.click();
	// (the pointer has to leave the button: its text also shows on hover)
	await page.mouse.move(0, 0);
	await page.locator('input[name=searchstring]').focus();
	await expect(info).toBeHidden();
	// by keyboard
	await button.focus();
	await page.keyboard.press('Shift+Tab');
	await page.keyboard.press('Tab');
	await expect(info).toBeVisible();
});

test('the list can be ordered by name: no headings per year, the year stands with the entry (#23)', async ({
	page
}) => {
	await openSearch(page);
	await page.locator('input[name=from]').fill('1880');
	await page.locator('input[name=to]').fill('1930');
	await page.locator('input[name=locality]').fill('Bern');
	await page.getByTestId('sort').selectOption('name');
	await page.locator('input[name=locality]').press('Enter');
	await expect(page.getByTestId('list')).toHaveAttribute('data-sort', 'name');
	await expect(page.getByTestId('year')).toHaveCount(0);
	await expect(page.getByTestId('entry-year')).toHaveCount(20);
	const names = await entries(page).locator('p > span.font-bold').allTextContents();
	expect(names.length).toBe(20);
	const sorted = [...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
	expect(names).toEqual(sorted);
	// back to the order by year: the headings return
	await page.getByTestId('sort').selectOption('year');
	await page.locator('input[name=locality]').press('Enter');
	await expect(page.getByTestId('list')).toHaveAttribute('data-sort', 'year');
	await expect(page.getByTestId('year').first()).toBeVisible();
	await expect(page.getByTestId('entry-year')).toHaveCount(0);
});

test('the list can be ordered by place', async ({ request }) => {
	const { data } = await search(request, {
		entityname1: 'Hodel',
		from: '1900',
		to: '1920',
		sort: 'locality'
	});
	const values = JSON.parse(data) as unknown[];
	const rows = values.filter(
		(v) => typeof v === 'object' && v !== null && 'locality' in v && 'entityname1' in v
	) as Record<string, number>[];
	const places = rows.map((row) => values[row.locality] as string | null);
	expect(places.length).toBeGreaterThan(20);
	const known = places.filter((p): p is string => p !== null);
	// the order of the database (its collation), checked on what it must do: no place returns after another began
	const seen = new Set<string>();
	let last: string | undefined;
	for (const p of known) {
		if (p !== last) {
			expect(seen.has(p), `"${p}" twice`).toBe(false);
			seen.add(p);
			last = p;
		}
	}
	// entries without a place come last
	expect(places.indexOf(null) === -1 || places.indexOf(null) >= known.length).toBe(true);
});
