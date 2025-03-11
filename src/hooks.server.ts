import type { Handle } from '@sveltejs/kit';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { Buffer } from 'buffer';
import { env } from '$env/dynamic/private';

if (typeof globalThis.Buffer === 'undefined') {
	globalThis.Buffer = Buffer;
}

if (typeof globalThis.process === 'undefined') {
	globalThis.process = { env };
}

// creating a handle to use the paraglide middleware
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});

export const handle: Handle = paraglideHandle;
