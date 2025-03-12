import type { Actions } from './$types';
import { db } from '$lib/server/db';
import { records } from '$lib/server/db/schema';
import { and, like, between, SQL, asc, or } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';

export const actions: Actions = {
	search: async (event) => {
		const formData = await event.request.formData();
		const searchString = formData.get('searchstring');
		const stringSchema = z.string().min(2).max(60);
		const from = formData.has('from') ? Number(formData.get('from')) : 1880;
		const to = formData.has('to') ? Number(formData.get('to')) : 1950;
		const numberSchema = z.number().int().min(1880).max(1950);
		if (!numberSchema.safeParse(from).success || !numberSchema.safeParse(to).success) {
			return fail(400, { error: 'Invalid year range', from, to });
		}

		if (searchString === '') {
			//Topical Search
			const fieldNames = [
				'entityname1',
				'entityname2',
				'supplement',
				'street',
				'locality',
				'phonenumber'
			] as const;
			let filters: SQL[] = [];
			fieldNames.forEach((fieldName) => {
				const parsed = stringSchema.safeParse(formData.get(fieldName));
				if (parsed.success) {
					filters.push(like(records[fieldName], `%${parsed.data}%`));
				}
			});
			try {
				const entries = db
					.select()
					.from(records)
					.where(and(...filters, between(records.year, from, to)))
					.orderBy(asc(records.year))
					.limit(2500);
				return { results: await entries };
			} catch (e: any) {
				return fail(500, { error: e.message, searchString });
			}
		} else {
			//Full Text Search
			try {
				const parsedSearchString = `%${stringSchema.parse(searchString)}%`;
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
				return { results: await entries };
			} catch (e: any) {
				return fail(500, { error: e.message, searchString });
			}
		}
	}
};
