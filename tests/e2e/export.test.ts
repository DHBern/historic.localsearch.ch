import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { openSearch } from './helpers.ts';

// The hits of a search as a CSV file (#28), against the fixture database.

test('the export holds all hits of the search, not the 20 on screen', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=searchstring]').fill('Hodel');
	await page.locator('input[name=searchstring]').press('Enter');
	// 3,092 hits; the list on screen gets the first 2,500
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 3’092');
	const download = page.waitForEvent('download');
	await page.getByTestId('export-csv').click();
	const file = await (await download).path();
	const text = readFileSync(file, 'utf8');
	expect(text.charCodeAt(0)).toBe(0xfeff);
	const lines = text.slice(1).trimEnd().split('\r\n');
	expect(lines[0]).toBe(
		'year,volume,page,name,first_name,supplement,street,locality,phone,network,kind,title,alliance,occupations,entry,page_image,similarity'
	);
	expect(lines.length).toBe(3092 + 1);
	// oldest first, with the address of the page image
	expect(lines[1]).toMatch(/^18\d\d,P-260-1_/);
	expect(lines[1]).toMatch(
		/https:\/\/iiif\.ptt-archiv\.ch\/iiif\/3\/P-260-1_.+_\d{4}\.jp2\/full\/max\/0\/default\.jpg,$/
	);
	await expect(page.getByTestId('export-truncated')).toHaveCount(0);
});

test('the export follows the fields and the years of the search', async ({ request }) => {
	const response = await request.post('/search/export', {
		form: { entityname1: 'Hodel', from: '1880', to: '1900' },
		headers: { origin: 'http://localhost:4173' }
	});
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toContain('text/csv');
	expect(response.headers()['content-disposition']).toContain('historic-localsearch.csv');
	const lines = (await response.text()).trimEnd().split('\r\n');
	expect(lines.length).toBe(18 + 1);
	for (const line of lines.slice(1)) expect(Number(line.slice(0, 4))).toBeLessThanOrEqual(1900);
});

test('an export without a search term is refused', async ({ request }) => {
	const response = await request.post('/search/export', {
		form: { from: '1880', to: '1950' },
		headers: { origin: 'http://localhost:4173' }
	});
	expect(response.status()).toBe(400);
});

test('the export of an approximate search states the similarity (#26)', async ({ request }) => {
	const response = await request.post('/search/export', {
		form: { entityname1: 'Hodel', from: '1919', to: '1920', mode: 'approx' },
		headers: { origin: 'http://localhost:4173' }
	});
	expect(response.status()).toBe(200);
	const lines = (await response.text()).trimEnd().split('\r\n');
	const misread = lines.filter((line) => line.includes('Hodei'));
	expect(misread.length).toBe(2);
	for (const line of misread) expect(line).toMatch(/,0\.\d+$/);
	// an entry spelled as typed has the similarity 1
	expect(lines.some((line) => /Hodel/.test(line) && line.endsWith(',1'))).toBe(true);
});
