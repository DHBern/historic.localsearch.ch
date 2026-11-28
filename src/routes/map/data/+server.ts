import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { municipalities, placeYear } from '#lib/server/db/schema.ts';
import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { error, json } from '@sveltejs/kit';

// the tables change only with an import: an hour in the browser, a day at the edge
const CACHE = 'public, max-age=3600, s-maxage=86400';

/**
 * The data of the network map (#6), read from the small tables of db/place_year.sql:
 *   ?year=1900   the municipalities with entries in that year, with their points
 *   ?place=351   the entries of one municipality (BFS number) per year
 */
export const GET: RequestHandler = async ({ url }) => {
	const year = url.searchParams.get('year');
	const place = url.searchParams.get('place');
	const db = getDb();
	try {
		if (year !== null && place === null) {
			const y = Number(year);
			if (!/^\d{4}$/.test(year) || y < 1880 || y > 1950) error(400, 'invalid year');
			const rows = await db
				.select({
					bfs: municipalities.bfs,
					name: municipalities.name,
					canton: municipalities.canton,
					lat: municipalities.lat,
					lon: municipalities.lon,
					n: placeYear.entries
				})
				.from(placeYear)
				.innerJoin(municipalities, eq(municipalities.bfs, placeYear.bfs))
				.where(and(eq(placeYear.year, y), ne(placeYear.bfs, 0)))
				.orderBy(desc(placeYear.entries), asc(municipalities.bfs));
			const places = rows.map((row) => ({
				...row,
				// five decimals are about a metre; real columns come back with float noise
				lat: Math.round(row.lat * 1e5) / 1e5,
				lon: Math.round(row.lon * 1e5) / 1e5,
				uncertain: 0
			}));
			return json({ year: y, places }, { headers: { 'cache-control': CACHE } });
		}
		if (place !== null && year === null) {
			const bfs = Number(place);
			if (!/^\d{1,4}$/.test(place) || bfs < 1) error(400, 'invalid place');
			const series = await db
				.select({ year: placeYear.year, n: placeYear.entries })
				.from(placeYear)
				.where(eq(placeYear.bfs, bfs))
				.orderBy(asc(placeYear.year));
			return json({ place: bfs, series }, { headers: { 'cache-control': CACHE } });
		}
	} catch (e) {
		if (e && typeof e === 'object' && 'status' in e) throw e;
		console.error('network map data failed', e);
		error(503, 'unavailable');
	}
	error(400, 'year or place');
};
