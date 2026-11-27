import type { Actions, PageServerLoad } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import {
	occupationRegister,
	places,
	placesNet,
	records,
	streets,
	volumes
} from '#lib/server/db/schema.ts';
import { and, asc, count, eq, sql, type SQL } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { MAX_ROWS, excerpt } from '#lib/search.ts';
import { criteria } from '#lib/server/criteria.ts';

// counting the hits of a very broad search must not hold up the answer
const COUNT_TIMEOUT_MS = 4000;

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
 * point, and what cannot be shown. The table `places` knows where a locality string of a volume is (#43);
 * `places_net` knows it for the names a volume holds twice, by the network of the entry (#71).
 */
async function placeCounts(where: SQL | undefined) {
	const db = getDb();
	return await db.transaction(async (tx) => {
		await tx.execute(sql.raw(`set local statement_timeout = ${COUNT_TIMEOUT_MS}`));
		// a key is in one of the two tables at most
		const bfs = sql<number | null>`coalesce(${places.bfs}, ${placesNet.bfs})`;
		const name = sql<string | null>`coalesce(${places.municipality}, ${placesNet.municipality})`;
		const canton = sql<string | null>`coalesce(${places.canton}, ${placesNet.canton})`;
		const lat = sql<number | null>`coalesce(${places.lat}, ${placesNet.lat})`;
		const lon = sql<number | null>`coalesce(${places.lon}, ${placesNet.lon})`;
		const rows = await tx
			.select({
				bfs,
				name,
				canton,
				lat,
				lon,
				n: count(),
				// hits whose place was only matched by a similar spelling
				uncertain:
					sql<number>`count(*) filter (where coalesce(${places.confidence}, ${placesNet.confidence}) = 'low')`.mapWith(
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
			.leftJoin(
				placesNet,
				and(
					eq(placesNet.locality, records.locality),
					eq(placesNet.file, records.file),
					eq(placesNet.network, records.network)
				)
			)
			.where(where)
			.groupBy(bfs, name, canton, lat, lon);
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
