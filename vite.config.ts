import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: [vitePreprocess(), mdsvex()],
			extensions: ['.svelte', '.svx'],
			adapter: adapter(),
			// #30. SvelteKit adds a nonce for the scripts and styles it writes into the page itself.
			// Page images come from the IIIF server of the PTT archive; everything else is our own.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self'],
					// the one inline style left is SvelteKit's own: the hidden element that announces a new page
					// to screen readers. Allowed by its hash; tests/e2e/headers.test.ts fails if an update changes it.
					'style-src-attr': [
						'unsafe-hashes',
						'sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo='
					],
					// wmts.geo.admin.ch: the historical maps of swisstopo under the map of hits (#45)
					'img-src': ['self', 'data:', 'https://iiif.ptt-archiv.ch', 'https://wmts.geo.admin.ch'],
					'font-src': ['self'],
					'connect-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'url', 'preferredLanguage', 'baseLocale']
		})
	]
});
