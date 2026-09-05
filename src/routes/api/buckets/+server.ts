import { db } from '$lib/server/db';
import { json } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { buckets } from '$lib/server/db/schema';
import { getGitHubConfig } from '$lib/server/config';
import { createRepo } from '$lib/server/github/repos';

/**
 * GET /api/buckets?status=available
 * List all buckets, optionally filtered by status.
 */
export const GET: RequestHandler = async ({ url }) => {
	const statusFilter = url.searchParams.get('status');

	let data;
	if (statusFilter) {
		data = await db
			.select()
			.from(buckets)
			.where(eq(buckets.status, statusFilter))
			.orderBy(desc(buckets.createdAt));
	} else {
		data = await db.select().from(buckets).orderBy(desc(buckets.createdAt));
	}

	return json({ data, total: data.length });
};

/**
 * POST /api/buckets
 * Create a new bucket (= a new GitHub repo under your account).
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { display_name?: string } = {};
	try {
		body = await request.json();
	} catch {
		// No body or invalid JSON is fine — display_name is optional
	}

	try {
		const { pat, owner, type } = getGitHubConfig();

		const id = crypto.randomUUID();
		const repoName = `vault-${id.slice(0, 8)}`;

		// Create GitHub repo under personal account or organization
		const repo = await createRepo(pat, repoName, false, owner, type as 'P' | 'O');

		// Persist bucket in DB
		const [bucket] = await db
			.insert(buckets)
			.values({
				id,
				githubRepoName: repoName,
				githubRepoFullName: repo.full_name,
				displayName: body.display_name ?? null
			})
			.returning();

		return json(bucket, { status: 201 });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[Buckets] Failed to create bucket:', message);
		return json({ error: 'Failed to create bucket', message }, { status: 500 });
	}
};
