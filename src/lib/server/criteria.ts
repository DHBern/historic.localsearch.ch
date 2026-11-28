// The conditions of a search, shared by the result list, the map and the export (#28).
import { bookFiles, placeCodes, places, placesNet, records } from '#lib/server/db/schema.ts';
import { and, asc, between, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { MAX_LENGTH, MIN_LENGTH, escapeLike } from '#lib/search.ts';

/**
 * The network of an entry as the key of `places_net`: entries without one have the key '' there (a name the
 * volume holds twice, decided for the entries whose heading was read without its canton; #71).
 */
export const networkKey = sql`case when ${records.network} is null or btrim(${records.network}) = '' then '' else ${records.network} end`;

export const FIRST_YEAR = 1880;
/** The limit to an area code is offered for searches that start in this year or later (#50). */
export const CODE_FIRST_YEAR = 1930;
export const LAST_YEAR = 1950;

const fieldNames = [
	'entityname1',
	'entityname2',
	'supplement',
	'street',
	'locality',
	'phonenumber',
	'alliance'
] as const;
// the kinds of entry the re-reading tells apart (#58); older volumes have none
const kinds = ['person', 'firma', 'amt'] as const;

// the order of the list (#23): oldest first, or by name, or by place; entries without the field come last
const orders = {
	year: [asc(records.year), asc(records.file), asc(records.page)],
	name: [
		sql`${records.entityname1} asc nulls last`,
		sql`${records.entityname2} asc nulls last`,
		asc(records.year),
		asc(records.file),
		asc(records.page)
	],
	locality: [
		sql`${records.locality} asc nulls last`,
		sql`${records.entityname1} asc nulls last`,
		asc(records.year),
		asc(records.file),
		asc(records.page)
	]
};
export type SortOrder = keyof typeof orders;

const termSchema = z.string().min(MIN_LENGTH).max(MAX_LENGTH);
const yearSchema = z.number().int().min(FIRST_YEAR).max(LAST_YEAR);

type Column = (typeof records)[(typeof fieldNames)[number] | 'aggregatedcontent'];

const contains = (column: Column) => {
	return (term: string) => ilike(column, `%${escapeLike(term)}%`);
};

// The approximate search (#26): a word of the field resembles the term. `<%` is the word similarity of pg_trgm
// and is served by the trigram indexes; its threshold is set per transaction (approxSetup).
/** How alike a word must be (0 to 1) to count as a hit of the approximate search. */
export const APPROX_THRESHOLD = 0.6;
/** Shorter terms resemble too much. */
export const APPROX_MIN_LENGTH = 4;
/** To run first in the transaction of an approximate search. */
export const approxSetup = sql.raw(
	`set local pg_trgm.word_similarity_threshold = ${APPROX_THRESHOLD}`
);

const resembles = (column: Column) => {
	return (term: string) => sql`(${contains(column)(term)} or ${term} <% ${column})`;
};
/** 1 if the field holds the term as typed, else how much its nearest word resembles it. */
const closeness = (column: Column, term: string) =>
	sql`case when ${contains(column)(term)} then 1 else coalesce(word_similarity(${term}, ${column}), 0) end`;

function text(value: FormDataEntryValue | null): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** The conditions of a search from its form, or the error to send back. */
export function criteria(formData: FormData, withPlace: boolean) {
	const from = formData.has('from') ? Number(formData.get('from')) : FIRST_YEAR;
	const to = formData.has('to') ? Number(formData.get('to')) : LAST_YEAR;
	if (!yearSchema.safeParse(from).success || !yearSchema.safeParse(to).success) {
		return { error: 'invalid_years' as const };
	}

	const searchString = text(formData.get('searchstring'));
	// the spelling: as typed, or also words that resemble the term (#26)
	const mode = text(formData.get('mode'));
	if (mode !== '' && mode !== 'exact' && mode !== 'approx')
		return { error: 'invalid_mode' as const };
	const approx = mode === 'approx';
	const match = approx ? resembles : contains;
	const scores: SQL[] = [];
	let where: SQL | undefined;
	if (searchString === '') {
		// search by field
		const filters: SQL[] = [];
		for (const fieldName of fieldNames) {
			const value = text(formData.get(fieldName));
			if (value === '') continue;
			if (!termSchema.safeParse(value).success) {
				return { error: 'too_short' as const };
			}
			if (approx && value.length < APPROX_MIN_LENGTH) return { error: 'approx_too_short' as const };
			filters.push(match(records[fieldName])(value));
			scores.push(closeness(records[fieldName], value));
		}
		// a normalised occupation or trade from the register (#58): every printed form of it
		const occupation = text(formData.get('occupation'));
		if (occupation !== '') {
			if (!/^[a-z_]{2,40}$/.test(occupation)) return { error: 'invalid_occupation' as const };
			filters.push(sql`${records.occupations} @> ARRAY[${occupation}]::text[]`);
		}
		if (filters.length === 0) {
			return { error: 'no_criteria' as const };
		}
		// narrowing by kind works only where the kind is known: it leaves out the volumes not read again
		const kind = text(formData.get('kind'));
		if (kind !== '') {
			if (!(kinds as readonly string[]).includes(kind)) return { error: 'invalid_kind' as const };
			filters.push(eq(records.kind, kind));
		}
		// second lines of one subscriber (Wohnung, Bureau, Appart.) can be left out; entries without a kind stay
		if (formData.get('nosub') === 'on') {
			filters.push(sql`${records.kind} is distinct from 'zusatz'`);
		}
		// volumes that have not been split into fields have no values to match: they drop out by themselves
		where = and(...filters, between(records.year, from, to));
	} else {
		// full text search
		if (!termSchema.safeParse(searchString).success) {
			return { error: 'too_short' as const };
		}
		if (approx && searchString.length < APPROX_MIN_LENGTH) {
			return { error: 'approx_too_short' as const };
		}
		// not the alliance name: it is part of the entry text anyway ("(-Goerger)")
		const columns: Column[] = [
			...fieldNames
				.filter((fieldName) => fieldName !== 'alliance')
				.map((fieldName) => records[fieldName]),
			records.aggregatedcontent
		];
		scores.push(
			sql`greatest(${sql.join(
				columns.map((column) => closeness(column, searchString)),
				sql`, `
			)})`
		);
		where = and(
			or(...columns.map((column) => match(column)(searchString))),
			between(records.year, from, to)
		);
	}
	// limit to a book (#50): the volumes of one network until 1910, or a regional volume from 1911. A name the
	// table does not have finds nothing.
	const book = text(formData.get('book'));
	if (book !== '') {
		if (book.length > 40) return { error: 'invalid_book' as const };
		where = and(
			where,
			sql`${records.file} in (select ${bookFiles.file} from ${bookFiles} where ${bookFiles.book} = ${book})`
		);
	}
	// limit to a network group by its area code (#50), for searches from 1930 on: the code printed with the entry
	// ("064"), else the code of its place (`place_codes`). An entry without either is not found.
	const code = text(formData.get('code'));
	if (code !== '') {
		if (!/^0\d\d$/.test(code)) return { error: 'invalid_code' as const };
		if (from < CODE_FIRST_YEAR) return { error: 'code_too_early' as const };
		const ofPlace = (table: typeof places | typeof placesNet, more: SQL) =>
			sql`(select ${placeCodes.code} from ${table} join ${placeCodes} on ${placeCodes.bfs} = ${table.bfs}
				where ${table.locality} = ${records.locality} and ${table.file} = ${records.file}${more})`;
		where = and(
			where,
			sql`coalesce(substring(${records.network} from '\\m0\\d\\d\\M'), ${ofPlace(places, sql``)},
				${ofPlace(placesNet, sql` and ${placesNet.network} = ${networkKey}`)}) = ${code}`
		);
	}
	const sort = text(formData.get('sort')) || 'year';
	if (!Object.hasOwn(orders, sort)) return { error: 'invalid_sort' as const };
	const order = orders[sort as SortOrder];
	// a click on the map narrows the list to one municipality of today (#45); the map itself is not narrowed
	const place = text(formData.get('place'));
	if (withPlace && place !== '') {
		const bfs = Number(place);
		if (!Number.isInteger(bfs) || bfs < 1 || bfs > 9999) return { error: 'invalid_place' as const };
		where = and(
			where,
			sql`(exists (select 1 from ${places} where ${places.locality} = ${records.locality} and ${places.file} = ${records.file} and ${places.bfs} = ${bfs})
				or exists (select 1 from ${placesNet} where ${placesNet.locality} = ${records.locality} and ${placesNet.file} = ${records.file} and ${placesNet.network} = ${networkKey} and ${placesNet.bfs} = ${bfs}))`
		);
	}
	// how near a hit is to what was typed: every field must match, so the weakest one counts
	const similarity = approx
		? sql<number>`least(${sql.join(scores, sql`, `)})`.mapWith(Number)
		: undefined;
	return { where, searchString, approx, similarity, order, sort: sort as SortOrder };
}
