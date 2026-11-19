import { defineConfig } from 'drizzle-kit';
if (
	!process.env.DATABASE_HOST ||
	!process.env.DATABASE_PORT ||
	!process.env.DATABASE_USER ||
	!process.env.DATABASE_PASSWORD ||
	!process.env.DATABASE_NAME
)
	throw new Error(
		'DATABASE_HOST, DATABASE_PORT, DATABASE_USER, DATABASE_PASSWORD and DATABASE_NAME must be set'
	);

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',

	dbCredentials: {
		host: process.env.DATABASE_HOST,
		port: Number(process.env.DATABASE_PORT),
		user: process.env.DATABASE_USER,
		password: process.env.DATABASE_PASSWORD,
		database: process.env.DATABASE_NAME
	},

	verbose: true,
	strict: true,
	dialect: 'postgresql'
});
