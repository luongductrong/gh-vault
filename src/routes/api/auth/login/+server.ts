import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAuthConfig } from '$lib/server/config';
import { signSessionToken } from '$lib/server/auth';

export const POST: RequestHandler = async ({ request }) => {
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

		const { token, expiresAt } = await signSessionToken(jwtSecret);
		return json({ token, expires_at: expiresAt });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return json({ error: 'Internal Server Error', message }, { status: 500 });
	}
};
