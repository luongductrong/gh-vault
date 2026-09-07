import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { R2_BUCKET_ID, UPLOAD_LIMITS } from '$lib/configs';
import { createNumberedFilename, isValidFilename } from '$lib/server/filenames';
import { isR2Configured } from '$lib/server/r2/config';
import { createR2ObjectKey, createR2UploadUrl, listR2Files } from '$lib/server/r2/objects';

/**
 * POST /api/buckets/r2/uploads
 * Reserve a unique object name and create a short-lived presigned PUT URL.
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

	const payload = body as {
		filename?: unknown;
		mime_type?: unknown;
		size?: unknown;
	};
	const filename = typeof payload.filename === 'string' ? payload.filename.trim() : '';
	const size = payload.size;
	const mimeType =
		typeof payload.mime_type === 'string' && payload.mime_type.trim()
			? payload.mime_type.trim()
			: null;

	if (!isValidFilename(filename)) {
		return json(
			{ error: 'Bad Request', message: 'filename must be a valid file name' },
			{ status: 400 }
		);
	}

	if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) {
		return json(
			{ error: 'Bad Request', message: 'size must be a positive integer' },
			{ status: 400 }
		);
	}

	if (size > UPLOAD_LIMITS.r2) {
		return json(
			{
				error: 'Payload Too Large',
				message: `File too large (${(size / 1024 / 1024).toFixed(1)}MB). Max ${UPLOAD_LIMITS.r2 / 1024 / 1024}MB.`
			},
			{ status: 413 }
		);
	}

	try {
		const existingFiles = await listR2Files();
		const uniqueFilename = createNumberedFilename(
			filename,
			existingFiles.map((file) => file.originalName)
		);
		const key = createR2ObjectKey(uniqueFilename);
		const signedUpload = await createR2UploadUrl(key, mimeType);

		return json(
			{
				key,
				filename: uniqueFilename,
				uploadUrl: signedUpload.uploadUrl,
				expiresAt: signedUpload.expiresAt,
				headers: signedUpload.headers
			},
			{ status: 201 }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[R2] Failed to create upload URL:', message);
		return json({ error: 'Failed to create R2 upload URL', message }, { status: 502 });
	}
};
