// Search rules shared by the search action and its tests.

/** A search returns at most this many entries, oldest first. */
export const MAX_ROWS = 2500;
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
