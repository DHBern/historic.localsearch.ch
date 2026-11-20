import { pgTable, index, text, integer, timestamp, real, primaryKey } from 'drizzle-orm/pg-core';

export const records = pgTable(
	'records',
	{
		entityname1: text(),
		entityname2: text(),
		supplement: text(),
		street: text(),
		locality: text(),
		phonenumber: text(),
		year: integer(),
		page: integer(),
		file: text(),
		network: text(),
		aggregatedcontent: text()
	},
	(table) => {
		return {
			idxEntityname1: index('idx_entityname1').using(
				'btree',
				table.entityname1.asc().nullsLast().op('text_ops')
			),
			idxEntityname2: index('idx_entityname2').using(
				'btree',
				table.entityname2.asc().nullsLast().op('text_ops')
			),
			idxLocality: index('idx_locality').using(
				'btree',
				table.locality.asc().nullsLast().op('text_ops')
			),
			idxPhonenumber: index('idx_phonenumber').using(
				'btree',
				table.phonenumber.asc().nullsLast().op('text_ops')
			),
			idxStreet: index('idx_street').using('btree', table.street.asc().nullsLast().op('text_ops')),
			idxTrgmAggregatedcontent: index('idx_trgm_aggregatedcontent').using(
				'gin',
				table.aggregatedcontent.asc().nullsLast().op('gin_trgm_ops')
			),
			idxTrgmEntityname1: index('idx_trgm_entityname1').using(
				'gin',
				table.entityname1.asc().nullsLast().op('gin_trgm_ops')
			),
			idxTrgmEntityname2: index('idx_trgm_entityname2').using(
				'gin',
				table.entityname2.asc().nullsLast().op('gin_trgm_ops')
			),
			idxTrgmLocality: index('idx_trgm_locality').using(
				'gin',
				table.locality.asc().nullsLast().op('gin_trgm_ops')
			),
			idxTrgmPhonenumber: index('idx_trgm_phonenumber').using(
				'gin',
				table.phonenumber.asc().nullsLast().op('gin_trgm_ops')
			),
			idxTrgmStreet: index('idx_trgm_street').using(
				'gin',
				table.street.asc().nullsLast().op('gin_trgm_ops')
			),
			idxTrgmSupplement: index('idx_trgm_supplement').using(
				'gin',
				table.supplement.asc().nullsLast().op('gin_trgm_ops')
			)
		};
	}
);

/** One row per volume, filled by db/volumes.sql after every import (#25). */
export const volumes = pgTable('volumes', {
	file: text().primaryKey(),
	year: integer().notNull(),
	entries: integer().notNull(),
	pages: integer().notNull(),
	firstPage: integer('first_page'),
	lastPage: integer('last_page'),
	withFields: integer('with_fields').notNull(),
	places: text().notNull(),
	updated: timestamp({ withTimezone: true }).notNull()
});

/** Where a locality string of a volume is: filled by geo/build.sh after every import (#43). */
export const places = pgTable(
	'places',
	{
		locality: text().notNull(),
		file: text().notNull(),
		name: text().notNull(),
		bfs: integer().notNull(),
		municipality: text().notNull(),
		canton: text().notNull(),
		lat: real().notNull(),
		lon: real().notNull(),
		placeLat: real('place_lat').notNull(),
		placeLon: real('place_lon').notNull(),
		method: text().notNull(),
		confidence: text().notNull()
	},
	(table) => [primaryKey({ columns: [table.locality, table.file] })]
);

/** Where a street string of a municipality is: filled by geo/build.sh for the towns in geo/street_towns.txt (#46). */
export const streets = pgTable(
	'streets',
	{
		bfs: integer().notNull(),
		street: text().notNull(),
		name: text().notNull(),
		lat: real().notNull(),
		lon: real().notNull()
	},
	(table) => [primaryKey({ columns: [table.bfs, table.street] })]
);
