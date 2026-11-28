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

/** The year a volume is of, from its name: "P-260-1_Basel_1881_2" → 1881. */
export function volumeYear(file: string): number | null {
	const years = file.match(/(?<=_)(18|19)\d\d(?=_|$)/g);
	return years ? Number(years[years.length - 1]) : null;
}

/** Below this share of pages with entries a volume counts as having a gap (the mark of the coverage page). */
export const GAP_SHARE = 80;

export type YearGaps = {
	year: number;
	/** volumes of the catalogue that are not in the database */
	missing: string[];
	/** volumes with pages without entries inside their page range */
	gaps: string[];
	/** volumes without fields: their entries have no locality and cannot be on a map */
	noFields: string[];
};

/**
 * The years whose numbers are too low for a reason that is not history (#6): a volume is missing, has pages
 * without entries, or has no locality per entry. A time series must mark these years instead of showing a drop.
 */
export function incompleteYears(
	volumes: {
		file: string;
		year: number;
		pages: number;
		firstPage: number | null;
		lastPage: number | null;
		withFields: number;
	}[],
	catalogue: string[]
): YearGaps[] {
	const years = new Map<number, YearGaps>();
	const of = (year: number) => {
		if (!years.has(year)) years.set(year, { year, missing: [], gaps: [], noFields: [] });
		return years.get(year)!;
	};
	for (const file of missingVolumes(
		catalogue,
		volumes.map((volume) => volume.file)
	)) {
		const year = volumeYear(file);
		if (year !== null) of(year).missing.push(volumeLabel(file));
	}
	for (const volume of volumes) {
		const share = pageShare(volume.pages, volume.firstPage, volume.lastPage);
		if (volume.withFields === 0) of(volume.year).noFields.push(volumeLabel(volume.file));
		else if (share !== null && share < GAP_SHARE)
			of(volume.year).gaps.push(volumeLabel(volume.file));
	}
	return [...years.values()].sort((a, b) => a.year - b.year);
}
