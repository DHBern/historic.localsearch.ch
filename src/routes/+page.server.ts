import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { records } from '$lib/server/db/schema';
import { eq, like } from 'drizzle-orm';

const names = [
	'Flick',
	'Hodel',
	'Bürki',
	'Loosli',
	'Scheller',
	'Schmid',
	'Schneider',
	'Schweizer',
	'Stalder',
	'Zürcher',
	'Zimmermann',
	'Zbinden',
	'Zumbrunn',
	'Zumstein',
	'Zumwald',
	'Mauch',
	'Maurer',
	'Meier',
	'Meister',
	'Merz',
	'Meyer',
	'Michel',
	'Müller'
];

export const load = (async () => {
	const promises = names.map((name) => {
		// const entries = db.select().from(records).where(eq(records.entityname1, name)).limit(10000);
		const entries = db
			.select()
			.from(records)
			.where(like(records.aggregatedcontent, `%${name}%`))
			.limit(10000);
		return entries;
	});
	return { names: names, promises: promises };
}) satisfies PageServerLoad;
