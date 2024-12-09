import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { records } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load = (async () => {
	const entries = await db
		.select()
		.from(records)
		.where(eq(records.entityname1, 'Hodel'))
		.limit(10000);
	return { data: entries };
}) satisfies PageServerLoad;
