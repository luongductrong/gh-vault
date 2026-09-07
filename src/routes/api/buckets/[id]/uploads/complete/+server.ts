import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { R2_BUCKET_ID } from '$lib/configs';
import { isR2Configured } from '$lib/server/r2/config';
import { completeR2Upload, isR2NotFoundError } from '$lib/server/r2/objects';

/**
 * POST /api/buckets/r2/uploads/complete
 * Verify the object written by the browser and return the normalized file item.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	if (params.id !== R2_BUCKET_ID) {
		return json(
			{ error: 'Method Not Allowed', message: 'This endpoint is only available for R2' },
			{ status: 405 }
		);
	}
	if (!isR2Configured()) {
		return json({ error: 'Service Unavailable', message: 'R2 is not configured' }, { status: 503 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad Request', message: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json(
			{ error: 'Bad Request', message: 'Request body must be an object' },
			{ status: 400 }
		);
	}

	const payload = body as { key?: unknown; size?: unknown };
	if (typeof payload.key !== 'string' || !payload.key) {
		return json({ error: 'Bad Request', message: 'key is required' }, { status: 400 });
	}

	const expectedSize = payload.size;
	if (
		expectedSize !== undefined &&
		(typeof expectedSize !== 'number' || !Number.isSafeInteger(expectedSize) || expectedSize <= 0)
	) {
		return json(
			{ error: 'Bad Request', message: 'size must be a positive integer' },
			{ status: 400 }
		);
	}

	try {
		const file = await completeR2Upload(payload.key, expectedSize as number | undefined);
		return json(file, { status: 201 });
	} catch (err) {
		if (isR2NotFoundError(err)) {
			return json(
				{ error: 'Not Found', message: 'Uploaded object was not found' },
				{ status: 404 }
			);
		}

		const message = err instanceof Error ? err.message : 'Unknown error';
		const status = message.includes('Invalid R2 object key') ? 400 : 422;
		console.error('[R2] Failed to complete upload:', message);
		return json({ error: 'Failed to complete R2 upload', message }, { status });
	}
};
