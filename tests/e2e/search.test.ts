import { expect, test, type Page } from '@playwright/test';
import { openSearch } from './helpers.ts';

// One test per defect of the bug-fix epic (#32), against the fixture database.

async function fullText(page: Page, term: string) {
	await openSearch(page);
	await page.locator('input[name=searchstring]').fill(term);
	await page.locator('input[name=searchstring]').press('Enter');
}

const entries = (page: Page) => page.locator('[data-testid=entry]');

test('states the number of hits, and says when the list is cut (#7)', async ({ page }) => {
	await fullText(page, 'Hodel');
	// the fixture has 3,092 hits; the server sends the first 2,500
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 3’092');
	await expect(page.getByTestId('truncated')).toContainText('die ersten 2’500 Treffer');
	await expect(page.getByTestId('truncated')).toContainText('reicht bis 1947');
});

test('a complete list has a count and no notice (#7)', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=from]').fill('1880');
	await page.locator('input[name=to]').fill('1900');
	await page.locator('input[name=entityname1]').fill('Hodel');
	await page.locator('input[name=entityname1]').press('Enter');
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 18');
	await expect(page.getByTestId('truncated')).toHaveCount(0);
});

test('says so when nothing was found (#8)', async ({ page }) => {
	await fullText(page, 'qqqxyzqq');
	await expect(page.getByTestId('no-hits')).toContainText('keine Treffer');
	await expect(entries(page)).toHaveCount(0);
});

test('explains a term that is too short (#8)', async ({ page }) => {
	await fullText(page, 'x');
	await expect(page.getByTestId('error')).toHaveText('Bitte geben Sie mindestens 2 Zeichen ein.');
});

test('an error replaces the previous result list', async ({ page }) => {
	await fullText(page, 'Hodel');
	await expect(entries(page)).toHaveCount(20);
	await page.locator('input[name=searchstring]').fill('x');
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(page.getByTestId('error')).toBeVisible();
	await expect(entries(page)).toHaveCount(0);
});

test('marks the hit although the case differs (#9)', async ({ page }) => {
	await fullText(page, 'hodel');
	await expect(entries(page)).toHaveCount(20);
	const mark = entries(page).first().locator('mark');
	await expect(mark).toHaveText('Hodel');
});

test('does not treat the search term as HTML (#10)', async ({ page }) => {
	const dialogs: string[] = [];
	page.on('dialog', (dialog) => {
		dialogs.push(dialog.message());
		void dialog.dismiss();
	});
	await fullText(page, '<img src=x onerror=alert(1)>');
	await expect(page.getByTestId('no-hits')).toBeVisible();
	expect(dialogs).toEqual([]);
});

test('the button names what it adds and leaves when all is shown (#11)', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=to]').fill('1900');
	await page.locator('input[name=entityname1]').fill('Hodel');
	await page.locator('input[name=entityname1]').press('Enter');
	// 18 hits: fewer than one step, so there is nothing to add
	await expect(entries(page)).toHaveCount(18);
	await expect(page.getByTestId('more')).toHaveCount(0);

	await fullText(page, 'Hodel');
	await expect(page.getByTestId('more')).toHaveText('Weitere Einträge (20/2’500)');
	await page.getByTestId('more').click();
	await expect(page.getByTestId('more')).toHaveText('Weitere Einträge (40/2’500)');
});

test('a new search starts again with 20 entries (#11)', async ({ page }) => {
	await fullText(page, 'Hodel');
	await page.getByTestId('more').click();
	await expect(entries(page)).toHaveCount(40);
	await page.locator('input[name=searchstring]').press('Enter');
	await expect(entries(page)).toHaveCount(20);
});

test('brings the answer into view (#12)', async ({ page }) => {
	await fullText(page, 'Hodel');
	await expect(page.getByTestId('hit-count')).toBeInViewport();
	await expect(entries(page).first()).toBeInViewport();
});

test('% and _ are searched as characters (#13)', async ({ page }) => {
	await fullText(page, '%%%');
	await expect(page.getByTestId('no-hits')).toBeVisible();
	await fullText(page, 'H_del');
	await expect(page.getByTestId('no-hits')).toBeVisible();
});

test('the help text does not describe an approximate search (#14)', async ({ page }) => {
	await openSearch(page);
	await page.getByRole('button', { name: 'Hilfe' }).click();
	const help = page.getByRole('dialog');
	await expect(help).toContainText('Weitere Einträge');
	await expect(help).not.toContainText('Ungefähre Suche');
});

test('pages have a title and a description (#15)', async ({ page, request }) => {
	await page.goto('/');
	await expect(page).toHaveTitle('historic.localsearch – Historisches Telephonbuch der Schweiz');
	await expect(page.locator('meta[name=description]')).toHaveAttribute(
		'content',
		'Suche in historischen Telefonbüchern von 1880 bis 1950'
	);
	await openSearch(page);
	await expect(page).toHaveTitle('Suche – historic.localsearch');
	expect((await request.get('/robots.txt')).status()).toBe(200);
});

test('each entry shows a small rendering of its own page (#24)', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=entityname1]').fill('Annoncenbureau');
	await page.locator('input[name=entityname1]').press('Enter');
	const first = page.locator('[data-testid=entry]').first();
	const picture = first.locator('[data-testid=thumbnail]');
	const scan = /^https:\/\/iiif\.ptt-archiv\.ch\/iiif\/3\/P-260-1_Zuerich_1880_\d{4}\.jp2\/full\//;
	await expect(picture).toHaveAttribute('src', new RegExp(scan.source + '64,/0/default\\.jpg$'));
	await expect(picture).toHaveAttribute('loading', 'lazy');
	// the picture links to the full scan of the same page
	const small = await picture.getAttribute('src');
	await expect(first.locator('a.thumbnail')).toHaveAttribute(
		'href',
		small!.replace('/full/64,/', '/full/max/')
	);
});

// Field search from 1938 on: only the volumes that have been read again have fields.

test('a field search reaches the volumes of 1938–1950 that have fields', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=from]').fill('1938');
	await page.locator('input[name=to]').fill('1950');
	// the field form stays, and says which years it covers
	await expect(page.getByTestId('field-years')).toContainText('1938 (teilweise)');
	await page.locator('input[name=entityname1]').fill('Hirschfelder');
	await page.locator('input[name=entityname1]').press('Enter');
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 1');
	await expect(entries(page).first()).toContainText('q. Mt-Blanc 23');
	await expect(entries(page).first()).toContainText('Genève');
});

test('a field search over all years includes 1938', async ({ page }) => {
	await openSearch(page);
	await page.locator('input[name=locality]').fill('Genève');
	await page.locator('input[name=street]').fill('Rhône');
	await page.locator('input[name=street]').press('Enter');
	await expect(page.getByTestId('year').last()).toHaveText('1938');
});

// What the re-reading knows about an entry (#58): kind, title, wife's family name.

async function fieldSearch(page: Page, fill: (page: Page) => Promise<void>) {
	await openSearch(page);
	await page.locator('input[name=from]').fill('1938');
	await fill(page);
	await page.locator('input[name=locality]').fill('Genève');
	await page.locator('input[name=locality]').press('Enter');
	await expect(page.getByTestId('hit-count')).toBeVisible();
}

test("an entry shows its kind, title and wife's family name", async ({ page }) => {
	await fieldSearch(page, async (p) => p.locator('input[name=entityname1]').fill('Hoch'));
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 1');
	await expect(page.getByTestId('alliance')).toContainText('Goerger');
	await expect(page.getByTestId('kind-of-entry')).toContainText('Person');
});

test("the wife's family name can be searched", async ({ page }) => {
	await fieldSearch(page, async (p) => p.locator('input[name=alliance]').fill('Zwahlen'));
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 1');
	await expect(entries(page).first()).toContainText('Hofler');
});

test('the search can be limited to firms, and second lines can be left out', async ({ page }) => {
	await fieldSearch(page, async (p) => p.getByTestId('kind').selectOption('firma'));
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 3');
	for (const kind of await page.getByTestId('kind-of-entry').allInnerTexts()) {
		expect(kind).toContain('Firma');
	}
	// all 19 entries of the volume, then without its one second line
	await fieldSearch(page, async () => {});
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 19');
	await fieldSearch(page, async (p) => p.locator('input[name=nosub]').check());
	await expect(page.getByTestId('hit-count')).toHaveText('Treffer: 18');
});
