// The conditions of a search, shared by the result list, the map and the export (#28).
import { places, placesNet, records } from '#lib/server/db/schema.ts';
import { and, between, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { MAX_LENGTH, MIN_LENGTH, escapeLike } from '#lib/search.ts';

export const FIRST_YEAR = 1880;
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

const termSchema = z.string().min(MIN_LENGTH).max(MAX_LENGTH);
const yearSchema = z.number().int().min(FIRST_YEAR).max(LAST_YEAR);

const contains = (column: (typeof records)[(typeof fieldNames)[number] | 'aggregatedcontent']) => {
	return (term: string) => ilike(column, `%${escapeLike(term)}%`);
};

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
			filters.push(contains(records[fieldName])(value));
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
		where = and(
			or(
				// not the alliance name: it is part of the entry text anyway ("(-Goerger)")
				...fieldNames
					.filter((fieldName) => fieldName !== 'alliance')
					.map((fieldName) => contains(records[fieldName])(searchString)),
				contains(records.aggregatedcontent)(searchString)
			),
			between(records.year, from, to)
		);
	}
	// a click on the map narrows the list to one municipality of today (#45); the map itself is not narrowed
	const place = text(formData.get('place'));
	if (withPlace && place !== '') {
		const bfs = Number(place);
		if (!Number.isInteger(bfs) || bfs < 1 || bfs > 9999) return { error: 'invalid_place' as const };
		where = and(
			where,
			sql`(exists (select 1 from ${places} where ${places.locality} = ${records.locality} and ${places.file} = ${records.file} and ${places.bfs} = ${bfs})
				or exists (select 1 from ${placesNet} where ${placesNet.locality} = ${records.locality} and ${placesNet.file} = ${records.file} and ${placesNet.network} = ${records.network} and ${placesNet.bfs} = ${bfs}))`
		);
	}
	return { where, searchString };
}
