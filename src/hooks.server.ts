import type { Handle } from '@sveltejs/kit/hooks';
import { sequence } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { baseLocale, cookieMaxAge, cookieName, locales } from '#lib/paraglide/runtime.js';

/** The language named in the address (`/en/…`), if any. Addresses without one are in the base language. */
function addressLocale(pathname: string): string | undefined {
	const first = pathname.split('/')[1];
	return first !== baseLocale && (locales as readonly string[]).includes(first) ? first : undefined;
}

/**
 * Paraglide asks the cookie first, so a link to `/en/search` opened in the language of an older choice.
 * A language in the address wins: the middleware is shown a request whose cookie says so, and the cookie
 * is set to match, so that the page keeps this language in the browser as well.
 */
function addressFirst(event: Parameters<Handle>[0]['event']): Request {
	const wanted = addressLocale(event.url.pathname);
	if (!wanted || event.cookies.get(cookieName) === wanted) return event.request;
	event.cookies.set(cookieName, wanted, {
		path: '/',
		maxAge: cookieMaxAge,
		httpOnly: false,
		sameSite: 'lax'
	});
	const headers = new Headers(event.request.headers);
	const others = (headers.get('cookie') ?? '')
		.split(/;\s*/)
		.filter((part) => part && !part.startsWith(`${cookieName}=`));
	headers.set('cookie', [...others, `${cookieName}=${wanted}`].join('; '));
	// a stand-in without the body: the middleware only reads address and headers, and the form data must stay unread
	return new Request(event.request.url, { headers });
}

// creating a handle to use the paraglide middleware
const paraglideHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(addressFirst(event), ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});

/**
 * #30. The Content-Security-Policy is written by SvelteKit (vite.config.ts), because it needs a nonce per
 * page; these three are the same for every answer.
 */
export const securityHeaders: Record<string, string> = {
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	// for browsers that do not know `frame-ancestors`
	'X-Frame-Options': 'DENY'
};

const headersHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	for (const [name, value] of Object.entries(securityHeaders)) response.headers.set(name, value);
	return response;
};

export const handle: Handle = sequence(headersHandle, paraglideHandle);
