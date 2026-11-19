import type { Actions } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { records } from '#lib/server/db/schema.ts';
import { and, asc, between, count, ilike, or, sql, type SQL } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { MAX_LENGTH, MAX_ROWS, MIN_LENGTH, escapeLike, excerpt } from '#lib/search.ts';

const FIRST_YEAR = 1880;
const LAST_YEAR = 1950;
// fields are only segmented up to 1937 (1938–1950 is unsegmented text)
const LAST_YEAR_WITH_FIELDS = 1937;
// counting the hits of a very broad search must not hold up the answer
const COUNT_TIMEOUT_MS = 4000;

const fieldNames = [
	'entityname1',
	'entityname2',
	'supplement',
	'street',
	'locality',
	'phonenumber'
] as const;

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

export const actions: Actions = {
	search: async (event) => {
		const formData = await event.request.formData();
		const from = formData.has('from') ? Number(formData.get('from')) : FIRST_YEAR;
		const to = formData.has('to') ? Number(formData.get('to')) : LAST_YEAR;
		if (!yearSchema.safeParse(from).success || !yearSchema.safeParse(to).success) {
			return fail(400, { error: 'invalid_years' as const });
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
					return fail(400, { error: 'too_short' as const });
				}
				filters.push(contains(records[fieldName])(value));
			}
			if (filters.length === 0) {
				return fail(400, { error: 'no_criteria' as const });
			}
			where = and(...filters, between(records.year, from, Math.min(to, LAST_YEAR_WITH_FIELDS)));
		} else {
			// full text search
			if (!termSchema.safeParse(searchString).success) {
				return fail(400, { error: 'too_short' as const });
			}
			where = and(
				or(
					...fieldNames.map((fieldName) => contains(records[fieldName])(searchString)),
					contains(records.aggregatedcontent)(searchString)
				),
				between(records.year, from, to)
			);
		}

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
	}
};
