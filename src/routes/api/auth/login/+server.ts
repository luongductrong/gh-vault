import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { getAuthConfig } from '$lib/server/config';
import { signSessionToken } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	let body: { username?: string; password?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad Request', message: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.username || !body.password) {
		return json(
			{ error: 'Bad Request', message: 'Username and password are required' },
			{ status: 400 }
		);
	}

	try {
		const { password, jwtSecret } = getAuthConfig();
		const reqUsername = body.username;
		const reqPassword = body.password;

		// NOTE: Username decoy validation logic.
		// To make the login form appear standard and reduce the risk of brute-force attacks, we require a username.
		// The validation rule: The first character of the username must match the first character of the password,
		// and the last character of the username must match the last character of the password.
		const isDecoyValid =
			reqUsername.length > 0 &&
			reqPassword.length > 0 &&
			reqUsername[0] === reqPassword[0] &&
			reqUsername[reqUsername.length - 1] === reqPassword[reqPassword.length - 1];

		if (reqPassword !== password || !isDecoyValid) {
			// Generic error message for both cases
			return json(
				{ error: 'Unauthorized', message: 'Invalid username or password' },
				{ status: 401 }
			);
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
