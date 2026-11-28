import { expect, test } from '@playwright/test';
import { openSearch } from './helpers.ts';

// #6: the network on a map without a search, year by year, and a slider over the years of a result.

async function openMap(page: import('@playwright/test').Page, query = '') {
	await page.goto(`/map${query}`);
	await page.locator('[data-ready=true]').waitFor();
}

test('the map of the network shows the entries of one year per municipality', async ({ page }) => {
	await openMap(page, '?year=1880');
	await expect(page.getByRole('heading', { name: 'Das Telefonnetz auf der Karte' })).toBeVisible();
	await expect(page.getByTestId('year-shown')).toHaveText('1880');
	// the fixture holds the whole first book of Zürich: 99 entries, all placed, in one municipality
	await expect(page.getByTestId('summary')).toContainText(
		'1880: 99 Einträge, davon 99 auf der Karte'
	);
	await expect(page.getByTestId('netmap')).toHaveAttribute('data-shown', '1880');
	await expect(page.getByTestId('map')).toHaveAttribute('data-places', '1');
	await expect(page.getByTestId('map-list')).toContainText('Zürich 99');
	// the bar of the year is drawn (its height is set in the browser: the page allows no inline styles)
	const column = page.locator('[data-testid=chart] [data-year="1880"] .column');
	expect((await column.boundingBox())!.height).toBeGreaterThan(5);
	// the map under the circles is that of the year
	await expect(page.getByTestId('map')).toHaveAttribute('data-year', '1880');
});

test('the year can be changed by buttons, slider and bars', async ({ page }) => {
	await openMap(page, '?year=1880');
	await page.getByTestId('year-next').click();
	await expect(page.getByTestId('year-shown')).toHaveText('1881');
	await expect(page.getByTestId('netmap')).toHaveAttribute('data-shown', '1881');
	await expect(page.getByTestId('map')).toHaveAttribute('data-year', '1881');
	await page.getByTestId('year-slider').fill('1900');
	await expect(page.getByTestId('year-shown')).toHaveText('1900');
	await expect(page.getByTestId('netmap')).toHaveAttribute('data-shown', '1900');
	await page.locator('[data-testid=chart] [data-year="1880"]').click();
	await expect(page.getByTestId('year-shown')).toHaveText('1880');
	await expect(page.getByTestId('year-prev')).toBeDisabled();
});

test('a year with a missing volume is marked, in the text and in the chart', async ({ page }) => {
	// the fixture has no volume of 1931 at all; the catalogue has three
	await openMap(page, '?year=1931');
	await expect(page.getByTestId('incomplete')).toContainText('Dieses Jahr ist unvollständig');
	await expect(page.getByTestId('incomplete')).toContainText('Nicht in der Datenbank');
	await expect(page.locator('[data-testid=chart] [data-year="1931"]')).toHaveClass(
		/incomplete-year/
	);
	// 1880 is whole
	await page.locator('[data-testid=chart] [data-year="1880"]').click();
	await expect(page.getByTestId('incomplete')).toHaveCount(0);
	await expect(page.locator('[data-testid=chart] [data-year="1880"]')).not.toHaveClass(
		/incomplete-year/
	);
});

test('a municipality shows its own entries per year', async ({ page }) => {
	await openMap(page, '?year=1880');
	await page
		.getByTestId('map-list')
		.getByRole('button', { name: /Zürich/ })
		.click();
	await expect(page.getByTestId('chart-title')).toContainText('Zürich: Einträge pro Jahr');
	await expect(page.getByTestId('place-year')).toContainText('Zürich: 99 Einträge im Jahr 1880');
	await expect(page.locator('[data-testid=chart] [data-year="1880"]')).toHaveAttribute(
		'data-value',
		'99'
	);
	await page.getByTestId('place-reset').click();
	await expect(page.getByTestId('chart-title')).toContainText('Einträge pro Jahr. Schwarz');
});

test('the data of the map: a year, a place, and nothing else', async ({ request }) => {
	const year = await request.get('/map/data?year=1880');
	expect(year.status()).toBe(200);
	expect(year.headers()['cache-control']).toContain('max-age');
	const { places } = await year.json();
	expect(places).toHaveLength(1);
	expect(places[0]).toMatchObject({ name: 'Zürich', canton: 'ZH', n: 99 });
	const place = await (await request.get(`/map/data?place=${places[0].bfs}`)).json();
	expect(place.series[0]).toEqual({ year: 1880, n: 99 });
	// the series of a place and the years agree
	const again = await (await request.get('/map/data?year=1881')).json();
	const zh = again.places.find((p: { bfs: number }) => p.bfs === places[0].bfs);
	expect(place.series.find((row: { year: number }) => row.year === 1881)?.n).toBe(zh?.n);
	for (const bad of [
		'',
		'?year=1700',
		'?year=abc',
		'?place=0',
		'?place=x',
		'?year=1900&place=261'
	]) {
		expect((await request.get(`/map/data${bad}`)).status(), bad).toBe(400);
	}
});

test('the header leads to the map', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('nav-map').click();
	await expect(page).toHaveURL(/\/map$/);
	await expect(page.getByRole('heading', { name: 'Das Telefonnetz auf der Karte' })).toBeVisible();
});

test('the map of a result has a slider over the years with hits', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=entityname1]').fill('Hodel');
	await page.locator('input[name=from]').fill('1900');
	await page.locator('input[name=to]').fill('1910');
	await page.locator('input[name=entityname1]').press('Enter');
	const hits = await page.getByTestId('hit-count').textContent();
	await page.getByTestId('map-toggle').click();
	await expect(page.getByTestId('map-year-shown')).toHaveText('Alle Jahre');
	const all = await page.getByTestId('map-shown').textContent();
	// the first year with hits
	await page.getByTestId('map-year').fill('0');
	await expect(page.getByTestId('map-year-shown')).toHaveText('1900');
	await expect(page.getByTestId('map-year-note')).toContainText('nur das Jahr 1900');
	await expect(page.getByTestId('map')).toHaveAttribute('data-year', '1900');
	await expect(page.getByTestId('map-shown')).not.toHaveText(all!);
	// the list is not narrowed
	await expect(page.getByTestId('hit-count')).toHaveText(hits!);
	await page.getByTestId('map-year-all').click();
	await expect(page.getByTestId('map-year-shown')).toHaveText('Alle Jahre');
	await expect(page.getByTestId('map-shown')).toHaveText(all!);
	await expect(page.getByTestId('map')).toHaveAttribute('data-year', '1910');
});

test('the hits of the years add up to the hits of the result', async ({ request }) => {
	const ask = async (form: Record<string, string>) => {
		const response = await request.post('/search?/map', {
			form,
			headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' }
		});
		const body = await response.json();
		if (body.type !== 'success') return { status: body.status as number };
		const values = JSON.parse(String(body.data)) as unknown[];
		const map = values.find((v) => typeof v === 'object' && v !== null && 'shown' in v) as Record<
			string,
			number
		>;
		const years =
			values[map.years] === undefined || values[map.years] === null
				? undefined
				: (values[map.years] as number[]).map((i) => {
						const row = values[i] as Record<string, number>;
						return { year: values[row.year] as number, n: values[row.n] as number };
					});
		return { status: 200, total: values[map.total] as number, years };
	};
	const form = { entityname1: 'Hodel', from: '1900', to: '1910' };
	const whole = await ask(form);
	expect(whole.years!.length).toBeGreaterThan(1);
	expect(whole.years!.reduce((sum, row) => sum + row.n, 0)).toBe(whole.total);
	const one = await ask({ ...form, mapyear: String(whole.years![0].year) });
	expect(one.total).toBe(whole.years![0].n);
	expect(one.years).toBeUndefined();
	expect((await ask({ ...form, mapyear: '19x0' })).status).toBe(400);
});
