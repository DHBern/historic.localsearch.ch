import type { PageServerLoad, Actions } from './$types';

export const load = (async ({ params }) => {
	console.log(params);
}) satisfies PageServerLoad;

export const actions: Actions = {
	search: async (event) => {
		const formData = await event.request.formData();
		console.log('formData', formData);
		// const promises = names.map((name) => {
		// 	// const entries = db.select().from(records).where(eq(records.entityname1, name)).limit(10000);
		// 	const entries = db
		// 		.select()
		// 		.from(records)
		// 		.where(like(records.aggregatedcontent, `%${name}%`))
		// 		.limit(10000);
		// 	return entries;
		// });
		return { results: 'test' };
	}
};
