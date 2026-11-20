import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// The counts per municipality behind the map (#44), against the fixture database.

async function mapCounts(request: APIRequestContext, form: Record<string, string>) {
	const response = await request.post('/search?/map', {
		form,
		headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' }
	});
	const body = await response.json();
	// the action result is serialised by SvelteKit as a flat array: values are looked up by text here
	return { type: body.type as string, status: body.status as number, data: String(body.data) };
}

test('counts the hits of the whole result per municipality', async ({ request }) => {
	const { type, data } = await mapCounts(request, { searchstring: 'Hodel' });
	expect(type).toBe('success');
	// 3,092 hits, more than the 2,500 the list gets
	expect(data).toContain('"total":');
	const values = JSON.parse(data) as unknown[];
	const map = values[
		values.findIndex((v) => typeof v === 'object' && v !== null && 'shown' in v)
	] as Record<string, number>;
	const number = (key: string) => values[map[key]] as number;
	expect(number('total')).toBe(3092);
	expect(number('shown') + number('noLocality') + number('unresolved')).toBe(3092);
	expect(number('shown')).toBeGreaterThan(900);
	// the largest circle
	expect(data).toContain('"Luzern"');
	expect(data).toMatch(/"Luzern","LU",47\.0\d+,8\.3\d+,149/);
});

test('a field search is counted with its years', async ({ request }) => {
	const { type, data } = await mapCounts(request, {
		entityname1: 'Hodel',
		from: '1880',
		to: '1900'
	});
	expect(type).toBe('success');
	const values = JSON.parse(data) as unknown[];
	const map = values.find((v) => typeof v === 'object' && v !== null && 'shown' in v) as Record<
		string,
		number
	>;
	expect(values[map.total]).toBe(18);
});

test('refuses what the search refuses', async ({ request }) => {
	expect((await mapCounts(request, { searchstring: 'x' })).status).toBe(400);
	expect((await mapCounts(request, {})).status).toBe(400);
});

// The map on the result page (#45). The tiles of swisstopo are not fetched in tests.

async function searchWithMap(page: Page, term: string) {
	await page.route('https://wmts.geo.admin.ch/**', (route) => route.abort());
	await page.goto('/search');
	await page.locator('input[name=searchstring]').fill(term);
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(page.getByTestId('hit-count')).toBeVisible();
}

test('the map is offered as an experiment and says what it does not show', async ({ page }) => {
	const violations: string[] = [];
	page.on('console', (message) => {
		if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
	});
	await searchWithMap(page, 'Hodel');
	await expect(page.getByTestId('map-panel')).toHaveCount(0);
	await page.getByTestId('map-toggle').click();
	await expect(page.getByTestId('map')).toBeVisible();
	// one circle per municipality
	await expect(page.locator('[data-testid=map] path.leaflet-interactive').first()).toBeVisible();
	const circles = await page.locator('[data-testid=map] path.leaflet-interactive').count();
	const shown = await page.getByTestId('map-shown').innerText();
	expect(shown).toContain(`in ${circles} heutigen Gemeinden`);
	expect(shown).toMatch(/von 3’092 Treffern/);
	await expect(page.getByTestId('map-no-locality')).toContainText('Bänden ohne Ortsangabe');
	await expect(page.getByTestId('map-list').locator('button').first()).toHaveText(/Luzern\s+149/);
	// the policy lets the map through; only the tiles are blocked, by this test
	expect(violations).toEqual([]);
	await page.getByTestId('map-toggle').click();
	await expect(page.getByTestId('map-panel')).toHaveCount(0);
});

test('choosing a municipality narrows the list, and the limit can be removed', async ({ page }) => {
	await searchWithMap(page, 'Hodel');
	await page.getByTestId('map-toggle').click();
	await page
		.getByTestId('map-list')
		.getByRole('button', { name: /Luzern/ })
		.click();
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 149');
	await expect(page.getByTestId('picked')).toContainText('Nur Luzern');
	// the map zooms to the municipality and its surroundings, it is not drawn anew for the whole country
	await expect
		.poll(async () => Number(await page.getByTestId('map').getAttribute('data-zoom')))
		.toBeGreaterThanOrEqual(11);
	await expect(page.getByTestId('map')).toBeInViewport();
	// the map still shows the whole result
	await expect(page.getByTestId('map-shown')).toContainText('von 3’092 Treffern');
	await page.getByTestId('picked').click();
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 3’092');
	await expect(page.getByTestId('picked')).toHaveCount(0);
	await expect
		.poll(async () => Number(await page.getByTestId('map').getAttribute('data-zoom')))
		.toBeLessThan(9);
});

test('a new search closes the map of the old one', async ({ page }) => {
	await searchWithMap(page, 'Hodel');
	await page.getByTestId('map-toggle').click();
	await expect(page.getByTestId('map')).toBeVisible();
	await page.locator('input[name=searchstring]').fill('Zürich');
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(page.getByTestId('map-panel')).toHaveCount(0);
});

// Street points inside a town (#46): Zürich, Basel and Bern have them.

test('a town with street points shows the hits at their streets', async ({ page }) => {
	await searchWithMap(page, 'strasse');
	await page.getByTestId('map-toggle').click();
	await page
		.getByTestId('map-list')
		.getByRole('button', { name: /Zürich/ })
		.click();
	await expect(page.getByTestId('picked')).toContainText('Nur Zürich');
	const note = page.getByTestId('map-streets');
	await expect(note).toContainText('In Zürich stehen');
	await expect(note).toContainText('Hausnummern sind nicht verortet');
	await expect(note).toContainText('swisstopo');
	// the dots are on the map, and the map has gone into the town
	await expect
		.poll(async () => Number(await page.getByTestId('map').getAttribute('data-streets')))
		.toBeGreaterThan(5);
	await expect
		.poll(async () => Number(await page.getByTestId('map').getAttribute('data-zoom')))
		.toBeGreaterThanOrEqual(12);
	// the numbers in the sentence are those of the list
	const hits = (await page.getByTestId('hit-count').innerText()).replace(/\D/g, '');
	await expect(note).toContainText(`von ${hits} Treffern`);
});

test('a municipality without street points stays as one circle', async ({ page }) => {
	await searchWithMap(page, 'Hodel');
	await page.getByTestId('map-toggle').click();
	await page
		.getByTestId('map-list')
		.getByRole('button', { name: /Luzern/ })
		.click();
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 149');
	await expect(page.getByTestId('map-streets')).toHaveCount(0);
	expect(await page.getByTestId('map').getAttribute('data-streets')).toBe('0');
});

test('the street count needs a municipality', async ({ request }) => {
	const response = await request.post('/search?/streets', {
		form: { searchstring: 'strasse' },
		headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' }
	});
	expect((await response.json()).status).toBe(400);
});

test('Basel has street points too', async ({ page }) => {
	await searchWithMap(page, 'Hodel');
	await page.getByTestId('map-toggle').click();
	await page.getByTestId('map-list').getByRole('button', { name: /Basel/ }).click();
	await expect(page.getByTestId('map-streets')).toContainText('In Basel stehen');
	await expect
		.poll(async () => Number(await page.getByTestId('map').getAttribute('data-streets')))
		.toBeGreaterThan(3);
});
