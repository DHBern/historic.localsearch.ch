import { defineConfig } from 'vitest/config';

// Unit tests are plain TypeScript: no SvelteKit plugin, so they run in a second.
export default defineConfig({
	test: {
		include: ['tests/unit/**/*.test.ts']
	}
});
