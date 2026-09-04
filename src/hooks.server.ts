import { env } from '$env/dynamic/private';
import { sequence } from '@sveltejs/kit/hooks';
import { verifySessionToken } from '$lib/server/auth';
import { json, redirect, type Handle } from '@sveltejs/kit';

const authHandle: Handle = async ({ event, resolve }) => {
	event.locals.authenticated = false;
	const { pathname } = event.url;

	const token = event.cookies.get('session_token');
	let isValid = false;

	if (token) {
		const jwtSecret = env.APP_JWT_SECRET;
		if (jwtSecret) {
			isValid = await verifySessionToken(token, jwtSecret);
		}
	}

	if (isValid) {
		event.locals.authenticated = true;
	} else if (token) {
		// Clean up invalid token
		event.cookies.delete('session_token', { path: '/' });
	}

	// 1. API routes checking
	if (pathname.startsWith('/api')) {
		if (pathname.startsWith('/api/auth/')) {
			return resolve(event);
		}
		if (!isValid) {
			return json({ error: 'Unauthorized', message: 'Authentication required' }, { status: 401 });
		}
		return resolve(event);
	}

	// 2. Client UI routes checking
	if (event.route.id) {
		if (!isValid && pathname !== '/login') {
			throw redirect(303, '/login');
		}
		if (isValid && pathname === '/login') {
			throw redirect(303, '/');
		}
	}

	return resolve(event);
};

export const handle: Handle = sequence(authHandle);
