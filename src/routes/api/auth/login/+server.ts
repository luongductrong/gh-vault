import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { getAuthConfig } from '$lib/server/config';
import { signSessionToken } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { password?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad Request', message: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.password) {
		return json({ error: 'Bad Request', message: 'Password is required' }, { status: 400 });
	}

	try {
		const { password, jwtSecret } = getAuthConfig();

		if (body.password !== password) {
			return json({ error: 'Unauthorized', message: 'Invalid password' }, { status: 401 });
		}

		// Tạo token sống 24h
		const { token } = await signSessionToken(jwtSecret, '24h');

		// Set HttpOnly cookie
		cookies.set('session_token', token, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: !dev, // Bật secure (HTTPS) nếu chạy ở production
			maxAge: 60 * 60 * 24 // 24 tiếng (tính bằng giây)
		});

		return json({ success: true, message: 'Logged in successfully' });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: 'Internal Server Error', message }, { status: 500 });
	}
};
