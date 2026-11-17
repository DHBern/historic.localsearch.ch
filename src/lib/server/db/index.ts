import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';

const REQUIRED = [
	'DATABASE_HOST',
	'DATABASE_PORT',
	'DATABASE_NAME',
	'DATABASE_USER',
	'DATABASE_PASSWORD'
] as const;

let instance: ReturnType<typeof drizzle> | undefined;

// Connect on first use, not at import: SvelteKit imports every server module
// while building, and preview builds have no database variables.
export function getDb() {
	if (instance) return instance;
	const missing = REQUIRED.filter((key) => !env[key]);
	if (missing.length > 0) {
		throw new Error(`Database is not configured: ${missing.join(', ')} not set`);
	}
	const client = postgres({
		pass: env.DATABASE_PASSWORD,
		host: env.DATABASE_HOST,
		user: env.DATABASE_USER,
		database: env.DATABASE_NAME,
		port: Number(env.DATABASE_PORT)
	});
	instance = drizzle(client);
	return instance;
}
