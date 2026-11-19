import type { PageServerLoad } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { volumes } from '#lib/server/db/schema.ts';
import { asc } from 'drizzle-orm';
import { missingVolumes } from '#lib/coverage.ts';
import pdfIds from '../search/pdfIds.json';

// The table `volumes` is a summary of `records`, written by db/volumes.sql after each import.
export const load: PageServerLoad = async () => {
	try {
		const rows = await getDb().select().from(volumes).orderBy(asc(volumes.year), asc(volumes.file));
		if (rows.length === 0) return { volumes: null, missing: [] };
		return {
			volumes: rows,
			missing: missingVolumes(
				Object.keys(pdfIds),
				rows.map((row) => row.file)
			)
		};
	} catch (e) {
		console.error('coverage failed', e);
		return { volumes: null, missing: [] };
	}
};
