import type { Page } from '@playwright/test';

/**
 * Open the search page and wait until it reacts to input. A test that types before that submits the form the
 * plain way: the page reloads, the search still works, but everything the test set up in the page is gone.
 */
export async function openSearch(page: Page) {
	await page.goto('/search');
	await page.locator('form[data-ready=true]').waitFor();
}
