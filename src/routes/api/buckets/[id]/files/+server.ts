import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { buckets, files } from '$lib/server/db/schema';
import { eq, desc, asc, and, like, or } from 'drizzle-orm';
import { getGitHubConfig } from '$lib/server/config';
import { uploadFile, buildCdnUrl } from '$lib/server/github/contents';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_FILENAME_LENGTH = 255;

function hasInvalidFilenameChars(value: string): boolean {
	return Array.from(value).some((char) => {
		const code = char.charCodeAt(0);
		return char === '/' || char === '\\' || code <= 0x1f || code === 0x7f;
	});
}

/**
 * GET /api/buckets/:id/files?offset=0&limit=20
 * List files in a bucket (from DB), paginated.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;
	// Always use offset-based pagination instead of pages to avoid confusion when flattening
	const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);
	const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
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

	let orderCol;
	if (sortBy === 'sizeBytes') {
		orderCol = files.sizeBytes;
	} else {
		orderCol = files.createdAt;
	}

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

	return json({ data: results, hasNextPage, nextOffset: offset + limit });
};

/**
 * POST /api/buckets/:id/files
 * Upload a file through the backend (max 4MB).
 *
 * Request body: { content: "base64...", filename: "photo.jpg", mime_type?: "image/jpeg" }
 * The `content` field must be a raw Base64 string WITHOUT the data URI prefix.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { id } = params;

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

	if (
		!filename ||
		filename.length > MAX_FILENAME_LENGTH ||
		filename === '.' ||
		filename === '..' ||
		hasInvalidFilenameChars(filename)
	) {
		return json(
			{ error: 'Bad Request', message: 'filename must be a valid file name' },
			{ status: 400 }
		);
	}

	const mimeType = typeof payload.mime_type === 'string' ? payload.mime_type : null;

	// Estimate original file size from Base64 length
	const padding = (content.match(/=+$/) || [''])[0].length;
	const sizeBytes = Math.floor((content.length * 3) / 4) - padding;

	if (sizeBytes > MAX_UPLOAD_BYTES) {
		return json(
			{
				error: 'Bad Request',
				message: `File too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.`
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

	// Generate stored filename: {short_uuid}_{timestamp}.{ext}
	const extensionMatch = filename.match(/\.([a-zA-Z0-9]{1,16})$/);
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
			`Upload ${filename} via gh-vault`
		);

		const cdnUrl = buildCdnUrl(owner, bucket.githubRepoName, commitSha, githubPath);

		// Insert file record
		const fileId = crypto.randomUUID();
		const [file] = await db
			.insert(files)
			.values({
				id: fileId,
				bucketId: id,
				originalName: filename,
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

		return json(file, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[Files] Upload failed:', message);
		return json({ error: 'Failed to upload file', message }, { status: 500 });
	}
};
