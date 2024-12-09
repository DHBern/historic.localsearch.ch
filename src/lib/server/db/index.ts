import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
if (!env.DATABASE_PASSWORD) throw new Error('DATABASE_URL is not set');
if (!env.DATABASE_HOST) throw new Error('DATABASE_URL is not set');
if (!env.DATABASE_USER) throw new Error('DATABASE_URL is not set');
if (!env.DATABASE_NAME) throw new Error('DATABASE_URL is not set');
if (!env.DATABASE_PORT) throw new Error('DATABASE_URL is not set');
// const client = postgres(env.DATABASE_URL);
const client = postgres({
	pass: env.DATABASE_PASSWORD,
	host: env.DATABASE_HOST,
	user: env.DATABASE_USER,
	database: env.DATABASE_NAME,
	port: Number(env.DATABASE_PORT)
});
export const db = drizzle(client);
