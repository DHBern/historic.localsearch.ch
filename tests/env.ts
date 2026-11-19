import { readFileSync } from 'node:fs';

// The test database: values from .env.test, overridden by the environment
// (CI and a local PostgreSQL on another port set DATABASE_* themselves).
export function testDatabaseEnv(): Record<string, string> {
	const env: Record<string, string> = {};
	const file = readFileSync(new URL('../.env.test', import.meta.url), 'utf8');
	for (const line of file.split('\n')) {
		const match = line.match(/^(DATABASE_[A-Z]+)="?([^"]*)"?$/);
		if (match) env[match[1]] = process.env[match[1]] ?? match[2];
	}
	return env;
}
