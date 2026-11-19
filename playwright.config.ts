import { defineConfig, devices } from '@playwright/test';
import { testDatabaseEnv } from './tests/env.ts';

const port = 4173;

// Browser tests run against the production build, served by `vite preview`,
// with the fixture database (tests/fixtures).
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${port}`,
		locale: 'de-CH',
		trace: 'retain-on-failure'
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'phone', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: `pnpm build && pnpm preview --port ${port} --strictPort`,
		port,
		timeout: 180_000,
		reuseExistingServer: !process.env.CI,
		env: testDatabaseEnv()
	}
});
