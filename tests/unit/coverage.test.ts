import { describe, expect, it } from 'vitest';
import { missingVolumes, pageShare, volumeLabel } from '#lib/coverage.ts';

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
