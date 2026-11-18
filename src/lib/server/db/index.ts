import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
	DATABASE_HOST,
	DATABASE_PORT,
	DATABASE_NAME,
	DATABASE_USER,
	DATABASE_PASSWORD
} from '$app/env/private';

let instance: ReturnType<typeof drizzle> | undefined;

// Connect on first use, not at import: SvelteKit imports every server module
// while building, and preview builds have no database variables.
export function getDb() {
	if (instance) return instance;
	const values = { DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER, DATABASE_PASSWORD };
	const missing = Object.entries(values)
		.filter(([, value]) => !value)
		.map(([key]) => key);
	if (missing.length > 0) {
		throw new Error(`Database is not configured: ${missing.join(', ')} not set`);
	}
	const client = postgres({
		pass: DATABASE_PASSWORD,
		host: DATABASE_HOST,
		user: DATABASE_USER,
		database: DATABASE_NAME,
		port: Number(DATABASE_PORT)
	});
	instance = drizzle(client);
	return instance;
}
