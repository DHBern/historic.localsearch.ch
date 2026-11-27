import type { RequestHandler } from './$types';
import { getDb } from '#lib/server/db/index.ts';
import { records } from '#lib/server/db/schema.ts';
import { asc, getTableColumns, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { EXPORT_MAX, csvLine, exportFileName, scanId } from '#lib/search.ts';
import { approxSetup, criteria } from '#lib/server/criteria.ts';

// a very broad search must not hold the function for long
const EXPORT_TIMEOUT_MS = 25000;
const HEADER = [
	'year',
	'volume',
	'page',
	'name',
	'first_name',
	'supplement',
	'street',
	'locality',
	'phone',
	'network',
	'kind',
	'title',
	'alliance',
	'occupations',
	'entry',
	'page_image',
	// approximate search (#26): how much the entry resembles the term (1 = as typed); else empty
	'similarity'
];

/**
 * The hits of a search as CSV (#28): the same form as the search, all hits up to EXPORT_MAX, oldest first, with
 * the volume, the page and the address of the page image.
 */
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const found = criteria(formData, true);
	if ('error' in found) error(400, found.error);
	let rows;
	try {
		rows = await getDb().transaction(async (tx) => {
			await tx.execute(sql.raw(`set local statement_timeout = ${EXPORT_TIMEOUT_MS}`));
			if (found.approx) await tx.execute(approxSetup);
			return await tx
				.select({
					...getTableColumns(records),
					similarity: found.similarity ?? sql<number | null>`null`
				})
				.from(records)
				.where(found.where)
				.orderBy(asc(records.year), asc(records.file), asc(records.page))
				.limit(EXPORT_MAX + 1);
		});
	} catch (e) {
		console.error('export failed', e);
		error(503, 'export_unavailable');
	}
	const truncated = rows.length > EXPORT_MAX;
	const lines = [csvLine(HEADER)];
	for (const row of rows.slice(0, EXPORT_MAX)) {
		const scan = scanId(row.file, row.page);
		lines.push(
			csvLine([
				row.year,
				row.file,
				row.page,
				row.entityname1,
				row.entityname2,
				row.supplement,
				row.street,
				row.locality,
				row.phonenumber,
				row.network,
				row.kind,
				row.title,
				row.alliance,
				row.occupations?.join(' | '),
				row.aggregatedcontent,
				scan ? `https://iiif.ptt-archiv.ch/iiif/3/${scan}/full/max/0/default.jpg` : null,
				row.similarity === null ? null : Math.round(Number(row.similarity) * 100) / 100
			])
		);
	}
	// the byte order mark makes spreadsheet programs read the file as UTF-8
	return new Response('﻿' + lines.join(''), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${exportFileName(formData, new Date())}"`,
			'cache-control': 'no-store',
			'x-export-rows': String(Math.min(rows.length, EXPORT_MAX)),
			'x-export-truncated': truncated ? '1' : '0'
		}
	});
};
