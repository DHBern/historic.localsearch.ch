import { describe, expect, it } from 'vitest';
import {
	incompleteYears,
	missingVolumes,
	pageShare,
	volumeLabel,
	volumeYear
} from '#lib/coverage.ts';

describe('missingVolumes', () => {
	it('names catalogue volumes without entries', () => {
		expect(missingVolumes(['P-260-1_1_1930', 'P-260-1_1_1931'], ['P-260-1_1_1930'])).toEqual([
			'P-260-1_1_1931'
		]);
	});
	it('takes the spellings of one volume as one', () => {
		const decomposed = 'P-260-1_Genève_1902';
		const composed = 'P-260-1_Genève_1902';
		expect(missingVolumes([decomposed, composed, 'P-260-1_Geneve_1902'], [composed])).toEqual([]);
		expect(missingVolumes([decomposed, composed], [])).toEqual([composed]);
	});
});

describe('pageShare', () => {
	it('is the share of the pages between first and last', () => {
		expect(pageShare(90, 11, 110)).toBe(90);
		expect(pageShare(1, 5, 5)).toBe(100);
	});
	it('is unknown without page numbers', () => {
		expect(pageShare(0, null, null)).toBeNull();
	});
});

describe('volumeLabel', () => {
	it('drops the shelf mark and the year', () => {
		expect(volumeLabel('P-260-1_2a_1947')).toBe('2a');
		expect(volumeLabel('P-260-1_Zuerich_1880')).toBe('Zuerich');
		expect(volumeLabel('P-260-1_Basel_1881_2')).toBe('Basel 2');
		expect(volumeLabel('P-260_Bern_ValdeTravers_1892')).toBe('Bern ValdeTravers');
	});
});

describe('incomplete years (#6)', () => {
	const volume = (file: string, year: number, pages: number, last: number, withFields = 1) => ({
		file,
		year,
		pages,
		firstPage: 1,
		lastPage: last,
		withFields
	});

	it('reads the year of a volume from its name', () => {
		expect(volumeYear('P-260-1_Basel_1881_2')).toBe(1881);
		expect(volumeYear('P-260-1_2a_1947')).toBe(1947);
		expect(volumeYear('P-260_NetzgruppeBern_1903')).toBe(1903);
		expect(volumeYear('nothing')).toBeNull();
	});

	it('names a year for a missing volume, pages without entries, or entries without a place', () => {
		const years = incompleteYears(
			[
				volume('P-260-1_1_1930', 1930, 100, 100),
				volume('P-260-1_2_1931', 1931, 100, 100),
				volume('P-260-1_3_1919', 1919, 70, 100),
				volume('P-260-1_1_1945', 1945, 100, 100, 0)
			],
			['P-260-1_1_1930', 'P-260-1_1_1931', 'P-260-1_2_1931', 'P-260-1_3_1919', 'P-260-1_1_1945']
		);
		expect(years).toEqual([
			{ year: 1919, missing: [], gaps: ['3'], noFields: [] },
			{ year: 1931, missing: ['1'], gaps: [], noFields: [] },
			{ year: 1945, missing: [], gaps: [], noFields: ['1'] }
		]);
	});

	it('leaves a whole year alone', () => {
		expect(incompleteYears([volume('P-260-1_1_1930', 1930, 81, 100)], ['P-260-1_1_1930'])).toEqual(
			[]
		);
	});
});
