import { describe, expect, it } from 'vitest';
import { escapeHtml, escapeLike, excerpt, formatNumber } from '../../src/lib/search.ts';

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
