import { defineEnvVars } from '@sveltejs/kit/env';

// Empty when unset (e.g. preview builds); getDb() reports which are missing.
export const variables = defineEnvVars({
	DATABASE_PASSWORD: { schema: (input) => input ?? '' },
	DATABASE_HOST: { schema: (input) => input ?? '' },
	DATABASE_USER: { schema: (input) => input ?? '' },
	DATABASE_NAME: { schema: (input) => input ?? '' },
	DATABASE_PORT: { schema: (input) => input ?? '' }
});
