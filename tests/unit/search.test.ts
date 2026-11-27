import { describe, expect, it } from 'vitest';
import {
	csvLine,
	exportFileName,
	escapeHtml,
	escapeLike,
	excerpt,
	formatNumber,
	scanId
} from '../../src/lib/search.ts';

describe('escapeLike', () => {
	it('makes the LIKE wildcards literal (#13)', () => {
		expect(escapeLike('%%%')).toBe('\\%\\%\\%');
		expect(escapeLike('M_ller')).toBe('M\\_ller');
		expect(escapeLike('a\\b')).toBe('a\\\\b');
	});
	it('leaves ordinary terms alone', () => {
		expect(escapeLike('Müller & Co.')).toBe('Müller & Co.');
	});
});

describe('excerpt', () => {
	it('marks the hit whatever its case (#9)', () => {
		expect(excerpt('Hodel, L., Metzger', 'hodel')).toBe('<mark>Hodel</mark>, L., Metzger');
		expect(excerpt('HODEL und Hodel', 'Hodel')).toBe('<mark>HODEL</mark> und <mark>Hodel</mark>');
	});
	it('keeps 40 characters on each side of the first hit', () => {
		const text = 'a'.repeat(100) + 'Hodel' + 'b'.repeat(100);
		expect(excerpt(text, 'hodel')).toBe(
			'...' + 'a'.repeat(40) + '<mark>Hodel</mark>' + 'b'.repeat(40) + '...'
		);
	});
	it('shows the start of the text when the hit was in another field', () => {
		expect(excerpt('Bern, Hauptgasse', 'Hodel')).toBe('Bern, Hauptgasse');
		expect(excerpt('x'.repeat(200), 'Hodel')).toBe('x'.repeat(85) + '...');
	});
	it('escapes entry text and term (#10)', () => {
		expect(excerpt('Meier & Co <b>', 'co')).toBe('Meier &amp; <mark>Co</mark> &lt;b&gt;');
		expect(excerpt('a <i> b', '<i>')).toBe('a <mark>&lt;i&gt;</mark> b');
		expect(excerpt('Meier & Co <b>')).toBe('Meier &amp; Co &lt;b&gt;');
	});
	it('treats characters with a meaning in patterns as text', () => {
		expect(excerpt('Tel. 12.34 (Büro)', '(büro)')).toBe('Tel. 12.34 <mark>(Büro)</mark>');
		expect(excerpt('1234', '2.3')).toBe('1234');
	});
});

describe('formatNumber', () => {
	it('groups thousands the Swiss way', () => {
		expect(formatNumber(20)).toBe('20');
		expect(formatNumber(2500)).toBe('2’500');
		expect(formatNumber(7011393)).toBe('7’011’393');
	});
});

describe('escapeHtml', () => {
	it('escapes the characters that end text or attributes', () => {
		expect(escapeHtml(`<a href="x">&`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
	});
});

describe('scanId', () => {
	it('names the scan of a page (#24)', () => {
		expect(scanId('P-260-1_2_1930', 72)).toBe('P-260-1_2_1930_0072.jp2');
	});
	it('composes a decomposed accent, as the image server names its files', () => {
		expect(scanId('P-260-1_Gene\u0300ve_1902', 10)).toBe('P-260-1_Gen%C3%A8ve_1902_0010.jp2');
		expect(scanId('P-260-1_Gen\u00e8ve_1902', 10)).toBe('P-260-1_Gen%C3%A8ve_1902_0010.jp2');
	});
	it('is null without a volume or a page', () => {
		expect(scanId(null, 3)).toBeNull();
		expect(scanId('P-260-1_2a_1920', null)).toBeNull();
	});
});

describe('csvLine (#28)', () => {
	it('quotes fields with a comma, a quote or a line break', () => {
		expect(csvLine(['Hodel', 'Metzger, Wirt', 'sagt "ja"', 'a\nb'])).toBe(
			'Hodel,"Metzger, Wirt","sagt ""ja""","a\nb"\r\n'
		);
	});
	it('leaves empty what is missing, and writes numbers as they are', () => {
		expect(csvLine([1923, null, undefined, '', 0])).toBe('1923,,,,0\r\n');
	});
	it('keeps a spreadsheet program from reading a field as a formula', () => {
		expect(csvLine(['=1+1', '-Frieden', '+41 31', '@x'])).toBe("'=1+1,'-Frieden,'+41 31,'@x\r\n");
		expect(csvLine([-5])).toBe('-5\r\n');
	});
});

describe('exportFileName (#28)', () => {
	const form = (values: Record<string, string>) => {
		const data = new FormData();
		for (const [key, value] of Object.entries(values)) data.append(key, value);
		return data;
	};
	// 18:05 UTC is 19:05 in Switzerland in winter
	const at = new Date('2026-11-27T18:05:12Z');
	it('names the search, the years and the time of the query', () => {
		expect(
			exportFileName(form({ entityname1: 'Hodel', locality: 'Bern', from: '1919', to: '1920' }), at)
		).toBe('historic-localsearch_name-Hodel_ort-Bern_1919-1920_2026-11-27_1905.csv');
	});
	it('names the book and the area code the search was limited to (#50)', () => {
		expect(
			exportFileName(form({ entityname1: 'Hodel', book: 'St. Gallen', code: '071' }), at)
		).toBe(
			'historic-localsearch_name-Hodel_buch-St-Gallen_vorwahl-071_1880-1950_2026-11-27_1905.csv'
		);
	});
	it('says so when the search was approximate, and uses summer time in summer', () => {
		expect(
			exportFileName(
				form({ searchstring: 'Müller & Söhne, Zürich', mode: 'approx', from: '1880', to: '1950' }),
				new Date('2026-07-01T10:00:00Z')
			)
		).toBe(
			'historic-localsearch_text-Mueller-Soehne-Zuerich_1880-1950_ungefaehr_2026-07-01_1200.csv'
		);
	});
	it('keeps to letters and digits and leaves out empty fields', () => {
		const name = exportFileName(
			form({
				entityname1: '../"x"\n',
				entityname2: '',
				street: 'r. de l’Hôtel',
				from: '1900',
				to: '1900'
			}),
			at
		);
		expect(name).toBe(
			'historic-localsearch_name-x_strasse-r-de-l-Hotel_1900-1900_2026-11-27_1905.csv'
		);
		expect(name).toMatch(/^[A-Za-z0-9_.-]+$/);
	});
});
