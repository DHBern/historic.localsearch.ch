import { inject, pageview } from '@vercel/analytics';
import { afterNavigate } from '$app/navigation';
import { browser, dev } from '$app/env';

// Vercel Web Analytics without '@vercel/analytics/sveltekit': that wrapper
// (2.0.1, and the 2.1 canary) imports '$app/stores', which SvelteKit 3
// removed. Importing it throws while the client starts, so the page never
// hydrates and no button works. This does what the wrapper did, with
// SvelteKit 3 APIs. Call it while the root layout initialises.
export function useAnalytics() {
	if (!browser) return;
	inject(
		{
			mode: dev ? 'development' : 'production',
			basePath: import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH,
			disableAutoTrack: true,
			framework: 'sveltekit'
		},
		import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG
	);
	afterNavigate(({ to }) => {
		if (to?.route.id) pageview({ route: to.route.id, path: to.url.pathname });
	});
}
