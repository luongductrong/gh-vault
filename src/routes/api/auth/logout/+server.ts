import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	// Xóa cookie bằng cách set maxAge = 0
	cookies.delete('session_token', {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: !dev
	});

	return json({ success: true, message: 'Logged out successfully' });
};
