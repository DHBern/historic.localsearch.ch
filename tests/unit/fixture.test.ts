import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { testDatabaseEnv } from '../env.ts';

// Checks the test database itself: if these fail, the fixture is not loaded
// (run `pnpm test:db`) and every other failure is noise.
const env = testDatabaseEnv();
const sql = postgres({
	host: env.DATABASE_HOST,
	port: Number(env.DATABASE_PORT),
	database: env.DATABASE_NAME,
	user: env.DATABASE_USER,
	pass: env.DATABASE_PASSWORD
});
afterAll(() => sql.end());

describe('fixture database', () => {
	it('holds the fixture rows', async () => {
		const [{ n }] = await sql`select count(*)::int n from records`;
		expect(n).toBe(3700);
	});

	it('has the trigram extension the search needs', async () => {
		const rows = await sql`select 1 from pg_extension where extname = 'pg_trgm'`;
		expect(rows).toHaveLength(1);
	});

	it('has more "Hodel" hits than the 2,500 rows a search used to return', async () => {
		const [{ n }] = await sql`
			select count(*)::int n from records
			where entityname1 ilike '%Hodel%' or aggregatedcontent ilike '%Hodel%'`;
		expect(n).toBe(3092);
	});

	it('covers fields (up to 1937, and one volume of 1938) and text fragments (from 1938)', async () => {
		const [{ fields, fragments }] = await sql`
			select count(*) filter (where year <= 1937 and entityname1 is not null)::int fields,
			       count(*) filter (where year >= 1938 and entityname1 is null)::int fragments
			from records`;
		expect(fields).toBeGreaterThan(1000);
		expect(fragments).toBeGreaterThan(1000);
	});

	it('has the place table for the map, built by geo/build.sh', async () => {
		const [zh] = await sql`
			select municipality, canton, confidence from places
			where locality = 'Zürich' and file = 'P-260-1_Zuerich_1880'`;
		expect(zh).toEqual({ municipality: 'Zürich', canton: 'ZH', confidence: 'high' });
		// every row points into Switzerland
		const [{ n }] = await sql`
			select count(*)::int n from places
			where lat not between 45.8 and 47.9 or lon not between 5.9 and 10.5`;
		expect(n).toBe(0);
	});

	it('has the occupation register and the occupations of the entries', async () => {
		const [{ n }] = await sql`select count(*)::int n from occupation_register`;
		expect(n).toBeGreaterThan(100);
		const forms = await sql`
			select distinct supplement from records
			where occupations @> array['landwirt'] order by 1`;
		// one occupation, several printed forms
		expect(forms.length).toBeGreaterThan(1);
		// every id in the entries is an id of the register
		const [{ unknown }] = await sql`
			select count(*)::int unknown from (select distinct unnest(occupations) id from records) x
			where id not in (select id from occupation_register)`;
		expect(unknown).toBe(0);
	});
});
