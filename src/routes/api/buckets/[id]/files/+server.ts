import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { buckets, files } from '$lib/server/db/schema';
import { eq, desc, asc, and, like, or } from 'drizzle-orm';
import { R2_BUCKET_ID, UPLOAD_LIMITS } from '$lib/configs';
import { getGitHubConfig } from '$lib/server/config';
import { createNumberedFilename, isValidFilename } from '$lib/server/filenames';
import { uploadFile, buildCdnUrl } from '$lib/server/github/contents';
import { deleteR2Object, isR2ObjectKey, listR2Files } from '$lib/server/r2/objects';
import { isR2Configured } from '$lib/server/r2/config';

function parsePaginationValue(value: string | null, fallback: number): number {
	const parsed = Number.parseInt(value ?? '', 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

async function getR2FileList(url: URL) {
	if (!isR2Configured()) {
		return json({ error: 'Not Found', message: 'R2 is not configured' }, { status: 404 });
	}

	try {
		const offset = Math.max(0, parsePaginationValue(url.searchParams.get('offset'), 0));
		const limit = Math.min(
			100,
			Math.max(1, parsePaginationValue(url.searchParams.get('limit'), 20))
		);
		const search = (url.searchParams.get('search') ?? '').toLowerCase();
		const sortBy = url.searchParams.get('sortBy') ?? 'createdAt';
		const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 1 : -1;
		const allFiles = await listR2Files();

		const filteredFiles = allFiles
			.filter((file) => {
				if (!search) return true;
				return [file.originalName, file.id, file.mimeType ?? ''].some((value) =>
					value.toLowerCase().includes(search)
				);
			})
			.sort((left, right) => {
				const leftValue = sortBy === 'sizeBytes' ? left.sizeBytes : Date.parse(left.createdAt);
				const rightValue = sortBy === 'sizeBytes' ? right.sizeBytes : Date.parse(right.createdAt);
				if (leftValue === rightValue) {
					return sortOrder * left.originalName.localeCompare(right.originalName);
				}
				return sortOrder * (leftValue - rightValue);
			});

		const results = filteredFiles.slice(offset, offset + limit);
		const totalSizeBytes = filteredFiles.reduce((total, file) => total + file.sizeBytes, 0);

		return json({
			data: results,
			hasNextPage: offset + limit < filteredFiles.length,
			nextOffset: offset + limit,
			totalCount: filteredFiles.length,
			totalSizeBytes
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[R2] Failed to list files:', message);
		return json({ error: 'Failed to list R2 files', message }, { status: 502 });
	}
}

/**
 * GET /api/buckets/:id/files?offset=0&limit=20
 * List files in a bucket. GitHub files come from the DB; R2 files come from
 * the bucket's S3-compatible object API.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;
	if (id === R2_BUCKET_ID) return getR2FileList(url);

	const offset = Math.max(0, parsePaginationValue(url.searchParams.get('offset'), 0));
	const limit = Math.min(100, Math.max(1, parsePaginationValue(url.searchParams.get('limit'), 20)));
	const search = url.searchParams.get('search') ?? '';
	const sortBy = url.searchParams.get('sortBy') ?? 'createdAt';
	const sortOrder = url.searchParams.get('sortOrder') ?? 'desc';

	// Verify bucket exists
	const [bucket] = await db.select().from(buckets).where(eq(buckets.id, id)).limit(1);
	if (!bucket) {
		return json({ error: 'Not Found', message: `Bucket ${id} not found` }, { status: 404 });
	}

	const searchConditions = search
		? or(like(files.originalName, `%${search}%`), eq(files.id, search), eq(files.mimeType, search))
		: undefined;

	const whereClause = searchConditions
		? and(eq(files.bucketId, id), searchConditions)
		: eq(files.bucketId, id);

	const orderCol = sortBy === 'sizeBytes' ? files.sizeBytes : files.createdAt;
	const orderFn = sortOrder === 'asc' ? asc : desc;

	// Fetch limit + 1 to determine if there is a next page
	const data = await db
		.select()
		.from(files)
		.where(whereClause)
		.orderBy(orderFn(orderCol))
		.limit(limit + 1)
		.offset(offset);

	const hasNextPage = data.length > limit;
	const results = hasNextPage ? data.slice(0, limit) : data;

	return json({
		data: results.map((file) => ({ ...file, provider: 'github' as const })),
		hasNextPage,
		nextOffset: offset + limit
	});
};

/**
 * POST /api/buckets/:id/files
 * Upload a GitHub file through the backend (max 4MB).
 *
 * Request body: { content: "base64...", filename: "photo.jpg", mime_type?: "image/jpeg" }
 * The `content` field must be a raw Base64 string WITHOUT the data URI prefix.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	if (id === R2_BUCKET_ID) {
		return json(
			{ error: 'Method Not Allowed', message: 'Use the R2 upload endpoint for direct uploads' },
			{ status: 405 }
		);
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
		content?: unknown;
		filename?: unknown;
		mime_type?: unknown;
	};

	if (typeof payload.content !== 'string' || typeof payload.filename !== 'string') {
		return json(
			{ error: 'Bad Request', message: 'content (base64) and filename are required' },
			{ status: 400 }
		);
	}

	const content = payload.content;
	const filename = payload.filename.trim();
	if (!content) {
		return json(
			{ error: 'Bad Request', message: 'content (base64) and filename are required' },
			{ status: 400 }
		);
	}

	if (!isValidFilename(filename)) {
		return json(
			{ error: 'Bad Request', message: 'filename must be a valid file name' },
			{ status: 400 }
		);
	}

	const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type : null;

	// Estimate original file size from Base64 length
	const padding = (content.match(/=+$/) || [''])[0].length;
	const sizeBytes = Math.floor((content.length * 3) / 4) - padding;

	if (sizeBytes > UPLOAD_LIMITS.github) {
		return json(
			{
				error: 'Bad Request',
				message: `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Max ${UPLOAD_LIMITS.github / 1024 / 1024}MB.`
			},
			{ status: 400 }
		);
	}

	// Check bucket exists and has capacity
	const [bucket] = await db.select().from(buckets).where(eq(buckets.id, id)).limit(1);
	if (!bucket) {
		return json({ error: 'Not Found', message: `Bucket ${id} not found` }, { status: 404 });
	}

	if (bucket.fileCount >= bucket.maxFiles) {
		return json(
			{ error: 'Conflict', message: `Bucket is full (${bucket.maxFiles} files max)` },
			{ status: 409 }
		);
	}

	if (bucket.totalSizeBytes + sizeBytes > bucket.maxSizeBytes) {
		return json(
			{ error: 'Conflict', message: 'Bucket storage capacity exceeded' },
			{ status: 409 }
		);
	}

	const existingFiles = await db
		.select({ originalName: files.originalName })
		.from(files)
		.where(eq(files.bucketId, id));
	const uniqueFilename = createNumberedFilename(
		filename,
		existingFiles.map((file) => file.originalName)
	);

	// Generate stored filename: {short_uuid}_{timestamp}.{ext}
	const extensionMatch = uniqueFilename.match(/\.([a-zA-Z0-9]{1,16})$/);
	const ext = extensionMatch?.[1].toLowerCase() ?? 'bin';
	const storedName = `${crypto.randomUUID().slice(0, 8)}_${Date.now()}.${ext}`;
	const githubPath = `images/${storedName}`;

	try {
		const { pat, owner } = getGitHubConfig();

		// Upload to GitHub
		const { fileSha, commitSha } = await uploadFile(
			pat,
			owner,
			bucket.githubRepoName,
			githubPath,
			content,
			`Upload ${uniqueFilename} via gh-vault`
		);

		const cdnUrl = buildCdnUrl(owner, bucket.githubRepoName, commitSha, githubPath);

		// Insert file record
		const fileId = crypto.randomUUID();
		const [file] = await db
			.insert(files)
			.values({
				id: fileId,
				bucketId: id,
				originalName: uniqueFilename,
				storedName,
				githubPath,
				githubFileSha: fileSha,
				commitSha,
				cdnUrl,
				sizeBytes,
				mimeType
			})
			.returning();

		// Update bucket stats
		const newFileCount = bucket.fileCount + 1;
		const newTotalSize = bucket.totalSizeBytes + sizeBytes;
		const newStatus =
			newFileCount >= bucket.maxFiles || newTotalSize >= bucket.maxSizeBytes ? 'full' : 'available';

		await db
			.update(buckets)
			.set({
				fileCount: newFileCount,
				totalSizeBytes: newTotalSize,
				status: newStatus,
				updatedAt: new Date().toISOString()
			})
			.where(eq(buckets.id, id));

		return json({ ...file, provider: 'github' as const }, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[Files] Upload failed:', message);
		return json({ error: 'Failed to upload file', message }, { status: 500 });
	}
};

/**
 * DELETE /api/buckets/:id/files
 * Delete an R2 object by its returned object key.
 */
export const DELETE: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	if (id !== R2_BUCKET_ID) {
		return json(
			{ error: 'Method Not Allowed', message: 'Only R2 objects can be deleted here' },
			{ status: 405 }
		);
	}
	if (!isR2Configured()) {
		return json({ error: 'Not Found', message: 'R2 is not configured' }, { status: 404 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad Request', message: 'Invalid JSON body' }, { status: 400 });
	}

	const key =
		body && typeof body === 'object' && !Array.isArray(body) && 'key' in body
			? (body as { key?: unknown }).key
			: undefined;
	if (typeof key !== 'string' || !isR2ObjectKey(key)) {
		return json(
			{ error: 'Bad Request', message: 'A valid R2 object key is required' },
			{ status: 400 }
		);
	}

	try {
		await deleteR2Object(key);
		return json({ data: { key } });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[R2] Failed to delete object:', message);
		return json({ error: 'Failed to delete R2 object', message }, { status: 502 });
	}
};
