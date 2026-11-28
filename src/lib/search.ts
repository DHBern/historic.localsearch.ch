// Search rules shared by the search action and its tests.

/** A search returns at most this many entries, oldest first. */
export const MAX_ROWS = 2500;
/** A CSV export holds at most this many entries, oldest first (#28). */
export const EXPORT_MAX = 100000;
export const MIN_LENGTH = 2;
export const MAX_LENGTH = 60;

/** Characters of entry text shown before and after the first hit. */
const CONTEXT = 40;

/** Make `%`, `_` and `\` in a search term match themselves in LIKE/ILIKE. */
export function escapeLike(term: string): string {
	return term.replace(/[\\%_]/g, '\\$&');
}

/** 46587 → 46’587: the same on server and browser, whose own formats differ. */
export function formatNumber(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+$)/g, '’');
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Entry text as safe HTML for the result list.
 *
 * Without a term: the whole text, escaped. With a term: the text around the
 * first hit, every hit in it wrapped in <mark>, whatever its case. When the
 * text does not contain the term (the hit was in another field), its start.
 */
export function excerpt(content: string, term?: string | null): string {
	if (!term) return escapeHtml(content);
	const source = escapeRegExp(term);
	const first = new RegExp(source, 'i').exec(content);
	const length = 2 * CONTEXT + term.length;
	if (!first) {
		return escapeHtml(content.slice(0, length)) + (content.length > length ? '...' : '');
	}
	const start = Math.max(0, first.index - CONTEXT);
	const end = Math.min(content.length, first.index + first[0].length + CONTEXT);
	const slice = content.slice(start, end);
	let html = '';
	let position = 0;
	for (const hit of slice.matchAll(new RegExp(source, 'gi'))) {
		html += escapeHtml(slice.slice(position, hit.index)) + `<mark>${escapeHtml(hit[0])}</mark>`;
		position = hit.index + hit[0].length;
	}
	html += escapeHtml(slice.slice(position));
	return (start > 0 ? '...' : '') + html + (end < content.length ? '...' : '');
}

/**
 * Name of the scan of a page on the archive's image server (iiif.ptt-archiv.ch), ready for an address.
 *
 * The server names its files with composed accents ("Genève"), so the volume
 * name is composed first. Null when the entry has no volume or no page.
 */
export function scanId(
	file: string | null | undefined,
	page: number | null | undefined
): string | null {
	if (!file || page === null || page === undefined) return null;
	return encodeURIComponent(`${file.normalize('NFC')}_${String(page).padStart(4, '0')}`) + '.jp2';
}

/**
 * One line of a CSV file (RFC 4180): fields that hold a comma, a quote or a line break are quoted. A field that
 * starts with =, +, - or @ gets an apostrophe in front, so that a spreadsheet program shows it instead of
 * running it as a formula ("-Frieden", "+41 31 …").
 */
export function csvLine(fields: (string | number | null | undefined)[]): string {
	return (
		fields
			.map((field) => {
				if (field === null || field === undefined) return '';
				let text = String(field);
				if (typeof field === 'string' && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
				return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
			})
			.join(',') + '\r\n'
	);
}

/** The parts of a search that go into the name of its export file, in this order. */
const FILE_PARTS: [field: string, label: string][] = [
	['searchstring', 'text'],
	['entityname1', 'name'],
	['entityname2', 'vorname'],
	['supplement', 'zusatz'],
	['street', 'strasse'],
	['locality', 'ort'],
	['phonenumber', 'tel'],
	['alliance', 'allianz'],
	['occupation', 'beruf'],
	['kind', 'art'],
	['book', 'buch'],
	['place', 'gemeinde']
];

/** "Zürich, Bahnhofstr." → "Zuerich-Bahnhofstr": letters and digits only, so that every system takes the name. */
function fileWord(value: string): string {
	return value
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/Ä/g, 'Ae')
		.replace(/Ö/g, 'Oe')
		.replace(/Ü/g, 'Ue')
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^A-Za-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 30);
}

/**
 * Name of the CSV file of a search (#28): what was searched, the years, and when the query ran (Swiss time):
 * "historic-localsearch_name-Hodel_ort-Bern_1919-1920_ungefaehr_2026-11-27_1905.csv".
 */
export function exportFileName(query: FormData, at: Date): string {
	const parts = ['historic-localsearch'];
	for (const [field, label] of FILE_PARTS) {
		const value = query.get(field);
		const word = typeof value === 'string' ? fileWord(value.trim()) : '';
		if (word) parts.push(`${label}-${word}`);
	}
	if (query.get('nosub') === 'on') parts.push('ohne-zweitzeilen');
	const year = (key: string, fallback: string) =>
		fileWord(String(query.get(key) ?? '')) || fallback;
	parts.push(`${year('from', '1880')}-${year('to', '1950')}`);
	if (query.get('mode') === 'approx') parts.push('ungefaehr');
	// "2026-11-27 19:05:12" in Swiss time, whatever the clock of the server or the browser says
	const stamp = new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Zurich',
		dateStyle: 'short',
		timeStyle: 'medium'
	}).format(at);
	parts.push(stamp.slice(0, 10), stamp.slice(11, 16).replace(':', ''));
	return parts.join('_') + '.csv';
}
