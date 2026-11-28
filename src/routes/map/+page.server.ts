import type { PageServerLoad } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { placeYear, volumes } from '#lib/server/db/schema.ts';
import { asc, sql } from 'drizzle-orm';
import { incompleteYears } from '#lib/coverage.ts';
import pdfIds from '../search/pdfIds.json';

/**
 * The map of the network without a search (#6): entries per municipality of today for one year. The page gets
 * the totals of every year and what is known to be missing; the circles of a year come from `/map/data`.
 */
export const load: PageServerLoad = async () => {
	try {
		const db = getDb();
		const [years, [{ largest }], volumeRows] = await Promise.all([
			db
				.select({
					year: placeYear.year,
					entries: sql<number>`sum(${placeYear.entries})`.mapWith(Number),
					placed:
						sql<number>`coalesce(sum(${placeYear.entries}) filter (where ${placeYear.bfs} <> 0), 0)`.mapWith(
							Number
						),
					places: sql<number>`count(*) filter (where ${placeYear.bfs} <> 0)`.mapWith(Number)
				})
				.from(placeYear)
				.groupBy(placeYear.year)
				.orderBy(asc(placeYear.year)),
			// one scale for all years, so that a circle grows with its place
			db
				.select({
					largest:
						sql<number>`coalesce(max(${placeYear.entries}) filter (where ${placeYear.bfs} <> 0), 1)`.mapWith(
							Number
						)
				})
				.from(placeYear),
			db.select().from(volumes)
		]);
		if (years.length === 0) return { years: null, largest: 1, incomplete: [] };
		return { years, largest, incomplete: incompleteYears(volumeRows, Object.keys(pdfIds)) };
	} catch (e) {
		console.error('network map failed', e);
		return { years: null, largest: 1, incomplete: [] };
	}
};
