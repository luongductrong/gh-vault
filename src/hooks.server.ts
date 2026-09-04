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

	// Đọc token từ HttpOnly cookie thay vì header
	const token = event.cookies.get('session_token');

	if (!token) {
		return json(
			{ error: 'Unauthorized', message: 'Authentication cookie required' },
			{ status: 401 }
		);
	}

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
		// Token không hợp lệ hoặc đã hết hạn, tiện tay xóa luôn cookie
		event.cookies.delete('session_token', { path: '/' });
		return json({ error: 'Unauthorized', message: 'Invalid or expired session' }, { status: 401 });
	}

	event.locals.authenticated = true;
	return resolve(event);
};

export const handle: Handle = sequence(authHandle);
