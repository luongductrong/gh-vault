import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { buckets } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * GET /api/buckets/:id
 * Get a single bucket's details including storage stats.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const [bucket] = await db.select().from(buckets).where(eq(buckets.id, id)).limit(1);

	if (!bucket) {
		return json({ error: 'Not Found', message: `Bucket ${id} not found` }, { status: 404 });
	}

	return json(bucket);
};
