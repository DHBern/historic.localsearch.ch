// What the coverage page works out from the per-volume summary (#25).

/** Same volume whatever the spelling of its name: "Genève" in either Unicode form, or "Geneve". */
function plain(name: string): string {
	return name.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Volumes of the archive catalogue that have no entry in the database. */
export function missingVolumes(catalogue: string[], inDatabase: string[]): string[] {
	const have = new Set(inDatabase.map(plain));
	const missing = new Map<string, string>();
	for (const name of catalogue) {
		if (!have.has(plain(name)) && !missing.has(plain(name))) {
			missing.set(plain(name), name.normalize('NFC'));
		}
	}
	return [...missing.values()].sort();
}

/** Pages with entries as a share of the pages from the first to the last one captured, in per cent. */
export function pageShare(pages: number, first: number | null, last: number | null): number | null {
	if (first === null || last === null || last < first) return null;
	return Math.min(100, Math.round((100 * pages) / (last - first + 1)));
}

/** "P-260-1_2a_1947" → "2a", "P-260-1_Zuerich_1880" → "Zuerich", "P-260-1_Basel_1881_2" → "Basel 2". */
export function volumeLabel(file: string): string {
	const parts = file
		.normalize('NFC')
		.replace(/^P-260(-\d+)?_/, '')
		.split('_');
	return parts.filter((part) => !/^(18|19)\d\d$/.test(part)).join(' ') || file;
}
