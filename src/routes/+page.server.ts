import type { Actions, PageServerLoad } from './$types';
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
	'Müller',
	'Aebi',
	'Aeschlimann',
	'Aeschbacher',
	'Bachmann',
	'Baumann',
	'Baumgartner',
	'Bieri',
	'Bischof',
	'Bischoff',
	'Bischofsberger',
	'Blaser',
	'Blum',
	'Bolliger',
	'Bosshard',
	'Brunner',
	'Bucher',
	'Bühler',
	'Burkhalter',
	'Burri',
	'Buser',
	'Bütikofer',
	'Caduff',
	'Camenzind',
	'Carlen',
	'Caroni',
	'Caspar',
	'Cattaneo',
	'Caviezel',
	'Christen',
	'Clerc'
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
