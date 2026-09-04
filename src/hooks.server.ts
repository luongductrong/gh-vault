import { env } from '$env/dynamic/private';
import { sequence } from '@sveltejs/kit/hooks';
import { json, type Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';

const authHandle: Handle = async ({ event, resolve }) => {
	event.locals.authenticated = false;

	const { pathname } = event.url;

	// Skip auth for non-API routes (SvelteKit pages)
	if (!pathname.startsWith('/api')) {
		return resolve(event);
	}

	// Public API routes — no auth required
	if (pathname.startsWith('/api/auth/')) {
		return resolve(event);
	}

	// All other /api/* routes require a valid Bearer token
	const authHeader = event.request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		return json({ error: 'Unauthorized', message: 'Bearer token required' }, { status: 401 });
	}

	const token = authHeader.slice(7).trim();
	const jwtSecret = env.APP_JWT_SECRET;

	if (!jwtSecret) {
		console.error('[Auth] APP_JWT_SECRET is not configured');
		return json(
			{ error: 'Internal Server Error', message: 'Auth not configured' },
			{ status: 500 }
		);
	}

	const isValid = await verifySessionToken(token, jwtSecret);
	if (!isValid) {
		return json({ error: 'Unauthorized', message: 'Invalid or expired token' }, { status: 401 });
	}

	event.locals.authenticated = true;
	return resolve(event);
};

export const handle: Handle = sequence(authHandle);
