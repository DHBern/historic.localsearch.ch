import type { Actions, PageServerLoad } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { occupationRegister, places, records, streets, volumes } from '#lib/server/db/schema.ts';
import { and, asc, between, count, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { MAX_LENGTH, MAX_ROWS, MIN_LENGTH, escapeLike, excerpt } from '#lib/search.ts';

const FIRST_YEAR = 1880;
const LAST_YEAR = 1950;
// counting the hits of a very broad search must not hold up the answer
const COUNT_TIMEOUT_MS = 4000;

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

/** Up to MAX_ROWS entries, oldest first, and the number of all hits (null if unknown). */
async function run(where: SQL | undefined) {
	const db = getDb();
	const rows = await db
		.select()
		.from(records)
		.where(where)
		.orderBy(asc(records.year), asc(records.file), asc(records.page))
		.limit(MAX_ROWS);
	if (rows.length < MAX_ROWS) return { rows, total: rows.length };
	try {
		const total = await db.transaction(async (tx) => {
			await tx.execute(sql.raw(`set local statement_timeout = ${COUNT_TIMEOUT_MS}`));
			const [{ n }] = await tx.select({ n: count() }).from(records).where(where);
			return n;
		});
		return { rows, total };
	} catch {
		return { rows, total: null };
	}
}

/**
 * Hits per municipality of today for the whole result, for the map (#44): one row per municipality with its
 * point, and what cannot be shown. The table `places` knows where a locality string of a volume is (#43).
 */
async function placeCounts(where: SQL | undefined) {
	const db = getDb();
	return await db.transaction(async (tx) => {
		await tx.execute(sql.raw(`set local statement_timeout = ${COUNT_TIMEOUT_MS}`));
		const rows = await tx
			.select({
				bfs: places.bfs,
				name: places.municipality,
				canton: places.canton,
				lat: places.lat,
				lon: places.lon,
				n: count(),
				// hits whose place was only matched by a similar spelling
				uncertain: sql<number>`count(*) filter (where ${places.confidence} = 'low')`.mapWith(
					Number
				),
				// hits without any locality (volumes without fields)
				noLocality:
					sql<number>`count(*) filter (where ${records.locality} is null or btrim(${records.locality}) = '')`.mapWith(
						Number
					)
			})
			.from(records)
			.leftJoin(places, and(eq(places.locality, records.locality), eq(places.file, records.file)))
			.where(where)
			.groupBy(places.bfs, places.municipality, places.canton, places.lat, places.lon);
		const unplaced = rows.find((row) => row.bfs === null);
		const placed = rows
			.filter((row) => row.bfs !== null)
			.map(({ bfs, name, canton, lat, lon, n, uncertain }) => ({
				bfs,
				name,
				canton,
				// five decimals are about a metre; real columns come back with float noise
				lat: Math.round(lat! * 1e5) / 1e5,
				lon: Math.round(lon! * 1e5) / 1e5,
				n,
				uncertain
			}))
			.sort((a, b) => b.n - a.n);
		const shown = placed.reduce((sum, row) => sum + row.n, 0);
		return {
			places: placed,
			total: shown + (unplaced?.n ?? 0),
			shown,
			noLocality: unplaced?.noLocality ?? 0,
			unresolved: (unplaced?.n ?? 0) - (unplaced?.noLocality ?? 0)
		};
	});
}

/**
 * Hits per street inside one municipality, for the map zoomed into a town (#46). `streets` knows the point of a
 * street string for the municipalities that have street points; for all others `available` is false.
 */
async function streetCounts(where: SQL | undefined, bfs: number) {
	const db = getDb();
	return await db.transaction(async (tx) => {
		await tx.execute(sql.raw(`set local statement_timeout = ${COUNT_TIMEOUT_MS}`));
		const [known] = await tx.select({ n: count() }).from(streets).where(eq(streets.bfs, bfs));
		if (!known || known.n === 0) return { available: false as const };
		// `where` already limits the hits to the municipality
		const rows = await tx
			.select({
				name: streets.name,
				lat: streets.lat,
				lon: streets.lon,
				n: count(),
				noStreet:
					sql<number>`count(*) filter (where ${records.street} is null or btrim(${records.street}) = '')`.mapWith(
						Number
					)
			})
			.from(records)
			.leftJoin(streets, and(eq(streets.bfs, bfs), eq(streets.street, records.street)))
			.where(where)
			.groupBy(streets.name, streets.lat, streets.lon);
		const unplaced = rows.find((row) => row.name === null);
		const placed = rows
			.filter((row) => row.name !== null)
			.map(({ name, lat, lon, n }) => ({
				name: name!,
				lat: Math.round(lat! * 1e5) / 1e5,
				lon: Math.round(lon! * 1e5) / 1e5,
				n
			}))
			.sort((a, b) => b.n - a.n);
		const shown = placed.reduce((sum, row) => sum + row.n, 0);
		return {
			available: true as const,
			bfs,
			streets: placed,
			total: shown + (unplaced?.n ?? 0),
			shown,
			noStreet: unplaced?.noStreet ?? 0,
			unresolved: (unplaced?.n ?? 0) - (unplaced?.noStreet ?? 0)
		};
	});
}

/** The conditions of a search from its form, or the error to send back. */
function criteria(formData: FormData, withPlace: boolean) {
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
			sql`exists (select 1 from ${places} where ${places.locality} = ${records.locality} and ${places.file} = ${records.file} and ${places.bfs} = ${bfs})`
		);
	}
	return { where, searchString };
}

/** The register of normalised occupations, for the suggestions in the form; empty if the table is missing. */
async function occupationList() {
	try {
		return await getDb().select().from(occupationRegister).orderBy(asc(occupationRegister.de));
	} catch {
		return [];
	}
}

/**
 * Which years from 1938 on can be searched by field: all their volumes, or only some (the others are still
 * text only). From the table `volumes`, so the form follows the imports by itself.
 */
export const load: PageServerLoad = async () => {
	try {
		const rows = await getDb()
			.select({
				year: volumes.year,
				all: count(),
				withFields: sql<number>`count(*) filter (where ${volumes.withFields} > 0)`.mapWith(Number)
			})
			.from(volumes)
			.where(sql`${volumes.year} >= 1938`)
			.groupBy(volumes.year)
			.orderBy(asc(volumes.year));
		const occupations = await occupationList();
		return {
			occupations,
			fieldYears: {
				full: rows.filter((r) => r.withFields === r.all).map((r) => r.year),
				partial: rows.filter((r) => r.withFields > 0 && r.withFields < r.all).map((r) => r.year)
			}
		};
	} catch {
		// no table, no database (preview builds): the form works without the note
		return { fieldYears: null, occupations: [] };
	}
};

export const actions: Actions = {
	search: async (event) => {
		const found = criteria(await event.request.formData(), true);
		if ('error' in found) return fail(400, { error: found.error });
		const { where, searchString } = found;

		try {
			const { rows, total } = await run(where);
			// the entry text goes to the page as HTML: escaped, hits marked
			const results = rows.map((row) => ({
				...row,
				aggregatedcontent: row.aggregatedcontent
					? excerpt(row.aggregatedcontent, searchString)
					: row.aggregatedcontent
			}));
			return { results, total };
		} catch (e) {
			console.error('search failed', e);
			return fail(500, { error: 'failed' as const });
		}
	},

	/** The same search, counted per municipality: asked for only when the map is opened. */
	map: async (event) => {
		const found = criteria(await event.request.formData(), false);
		if ('error' in found) return fail(400, { error: found.error });
		try {
			return { map: await placeCounts(found.where) };
		} catch (e) {
			// a very broad search runs into the time limit: no map, the list is not affected
			console.error('map count failed', e);
			return fail(503, { error: 'map_unavailable' as const });
		}
	},

	/** The hits of one municipality, counted per street: asked for when the map zooms into a town. */
	streets: async (event) => {
		const formData = await event.request.formData();
		const bfs = Number(formData.get('place'));
		const found = criteria(formData, true);
		if ('error' in found) return fail(400, { error: found.error });
		if (!Number.isInteger(bfs) || bfs < 1) return fail(400, { error: 'invalid_place' as const });
		try {
			return { streets: await streetCounts(found.where, bfs) };
		} catch (e) {
			console.error('street count failed', e);
			return fail(503, { error: 'map_unavailable' as const });
		}
	}
};
