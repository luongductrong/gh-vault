import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { buckets, files } from '$lib/server/db/schema';
import { eq, count, desc } from 'drizzle-orm';
import { getGitHubConfig } from '$lib/server/config';
import { uploadFile, buildCdnUrl } from '$lib/server/github/contents';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB

/**
 * GET /api/buckets/:id/files?page=1&limit=20
 * List files in a bucket (from DB), paginated.
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const { id } = params;
	const page = parseInt(url.searchParams.get('page') ?? '1', 10);
	const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);
	const offset = (page - 1) * limit;

	// Verify bucket exists
	const [bucket] = await db.select().from(buckets).where(eq(buckets.id, id)).limit(1);
	if (!bucket) {
		return json({ error: 'Not Found', message: `Bucket ${id} not found` }, { status: 404 });
	}

	const [{ total }] = await db
		.select({ total: count() })
		.from(files)
		.where(eq(files.bucketId, id));

	const data = await db
		.select()
		.from(files)
		.where(eq(files.bucketId, id))
		.orderBy(desc(files.createdAt))
		.limit(limit)
		.offset(offset);

	return json({ data, total, page, limit });
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

	let body: { content?: string; filename?: string; mime_type?: string };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Bad Request', message: 'Invalid JSON body' }, { status: 400 });
	}

	if (!body.content || !body.filename) {
		return json(
			{ error: 'Bad Request', message: 'content (base64) and filename are required' },
			{ status: 400 }
		);
	}

	// Estimate original file size from Base64 length
	const padding = (body.content.match(/=+$/) || [''])[0].length;
	const sizeBytes = Math.floor((body.content.length * 3) / 4) - padding;

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
	const ext = body.filename.includes('.') ? body.filename.split('.').pop()! : 'bin';
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
			body.content,
			`Upload ${body.filename} via gh-vault`
		);

		const cdnUrl = buildCdnUrl(owner, bucket.githubRepoName, commitSha, githubPath);

		// Insert file record
		const fileId = crypto.randomUUID();
		const [file] = await db
			.insert(files)
			.values({
				id: fileId,
				bucketId: id,
				originalName: body.filename,
				storedName,
				githubPath,
				githubFileSha: fileSha,
				commitSha,
				cdnUrl,
				sizeBytes,
				mimeType: body.mime_type ?? null
			})
			.returning();

		// Update bucket stats
		const newFileCount = bucket.fileCount + 1;
		const newTotalSize = bucket.totalSizeBytes + sizeBytes;
		const newStatus =
			newFileCount >= bucket.maxFiles || newTotalSize >= bucket.maxSizeBytes
				? 'full'
				: 'available';

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
