import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { buckets } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { R2_BUCKET_ID } from '$lib/configs';
import { getR2Bucket, isR2Configured } from '$lib/server/r2/config';

/**
 * GET /api/buckets/:id
 * Get a single bucket's details including storage stats.
 */
export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	if (id === R2_BUCKET_ID) {
		if (!isR2Configured()) {
			return json({ error: 'Not Found', message: 'R2 is not configured' }, { status: 404 });
		}
		return json(getR2Bucket());
	}

	const [bucket] = await db.select().from(buckets).where(eq(buckets.id, id)).limit(1);

	if (!bucket) {
		return json({ error: 'Not Found', message: `Bucket ${id} not found` }, { status: 404 });
	}

	return json({ ...bucket, provider: 'github' as const });
};
