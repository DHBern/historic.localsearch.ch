import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { records } from '$lib/server/db/schema';
import { eq, like } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';

export const load = (async ({ url }) => {
	console.log(url.searchParams.get('q'));
	return { results: 'test' };
}) satisfies PageServerLoad;

export const actions: Actions = {
	search: async (event) => {
		const formData = await event.request.formData();
		const searchString = formData.get('searchstring');
		const schema = z.string().min(2).max(60);

		// const entries = db.select().from(records).where(eq(records.entityname1, name)).limit(10000);
		try {
			// let results: Record<number, any[]> = {};
			const entries = db
				.select()
				.from(records)
				.where(like(records.aggregatedcontent, `%${schema.parse(searchString)}%`))
				.limit(90000);
			// (await entries).forEach((entry) => {
			// 	if (entry.year !== null) {
			// 		if (results[entry.year]) {
			// 			results[entry.year].push(entry);
			// 		} else {
			// 			results[entry.year] = [entry];
			// 		}
			// 	}
			// });
			return { results: await entries };
		} catch (e: any) {
			return fail(500, { error: e.message, searchString });
		}
	}
};
