import { expect, test, type APIRequestContext } from '@playwright/test';

// The counts per municipality behind the map (#44), against the fixture database.

async function mapCounts(request: APIRequestContext, form: Record<string, string>) {
	const response = await request.post('/search?/map', {
		form,
		headers: { 'x-sveltekit-action': 'true', origin: 'http://localhost:4173' }
	});
	const body = await response.json();
	// the action result is serialised by SvelteKit as a flat array: values are looked up by text here
	return { type: body.type as string, status: body.status as number, data: String(body.data) };
}

test('counts the hits of the whole result per municipality', async ({ request }) => {
	const { type, data } = await mapCounts(request, { searchstring: 'Hodel' });
	expect(type).toBe('success');
	// 3,092 hits, more than the 2,500 the list gets
	expect(data).toContain('"total":');
	const values = JSON.parse(data) as unknown[];
	const map = values[
		values.findIndex((v) => typeof v === 'object' && v !== null && 'shown' in v)
	] as Record<string, number>;
	const number = (key: string) => values[map[key]] as number;
	expect(number('total')).toBe(3092);
	expect(number('shown') + number('noLocality') + number('unresolved')).toBe(3092);
	expect(number('shown')).toBeGreaterThan(900);
	// the largest circle
	expect(data).toContain('"Luzern"');
	expect(data).toMatch(/"Luzern","LU",47\.0\d+,8\.3\d+,149/);
});

test('a field search is counted with its years', async ({ request }) => {
	const { type, data } = await mapCounts(request, {
		entityname1: 'Hodel',
		from: '1880',
		to: '1900'
	});
	expect(type).toBe('success');
	const values = JSON.parse(data) as unknown[];
	const map = values.find((v) => typeof v === 'object' && v !== null && 'shown' in v) as Record<
		string,
		number
	>;
	expect(values[map.total]).toBe(18);
});

test('refuses what the search refuses', async ({ request }) => {
	expect((await mapCounts(request, { searchstring: 'x' })).status).toBe(400);
	expect((await mapCounts(request, {})).status).toBe(400);
});
