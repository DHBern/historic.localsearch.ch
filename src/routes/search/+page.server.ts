import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db';
import { records } from '$lib/server/db/schema';
import { eq, and, like, between, SQL, asc, or } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';

export const load = (async ({ url }) => {
	return { results: 'test' };
}) satisfies PageServerLoad;

export const actions: Actions = {
	search: async (event) => {
		const formData = await event.request.formData();
		const searchString = formData.get('searchstring');
		const schema = z.string().min(2).max(60);
		const from = Number(formData.get('from'));
		const to = Number(formData.get('to'));

		// const entries = db.select().from(records).where(eq(records.entityname1, name)).limit(10000);
		try {
			// let results: Record<number, any[]> = {};
			const parsedSearchString = `%${schema.parse(searchString)}%`;
			const entries = db
				.select()
				.from(records)
				.where(
					and(
						or(
							like(records.entityname1, parsedSearchString),
							like(records.entityname2, parsedSearchString),
							like(records.supplement, parsedSearchString),
							like(records.street, parsedSearchString),
							like(records.locality, parsedSearchString),
							like(records.phonenumber, parsedSearchString),
							like(records.aggregatedcontent, parsedSearchString)
						),
						between(records.year, from, to)
					)
				)
				.orderBy(asc(records.year))
				.limit(2500);
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
