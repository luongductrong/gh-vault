import { env } from '$env/dynamic/private';
import { R2_BUCKET_ID } from '$lib/configs';
import type { Bucket } from '$lib/types';

export interface R2Config {
	accountId: string;
	bucketName: string;
	accessKeyId: string;
	secretAccessKey: string;
	publicBaseUrl: string | null;
}

function getR2Environment() {
	return {
		accountId: env.R2_ACCOUNT_ID?.trim(),
		bucketName: env.R2_BUCKET_NAME?.trim(),
		accessKeyId: env.R2_ACCESS_KEY_ID?.trim(),
		secretAccessKey: env.R2_SECRET_ACCESS_KEY?.trim(),
		publicBaseUrl: env.R2_PUBLIC_BASE_URL?.trim() || null
	};
}

export function isR2Configured(): boolean {
	const config = getR2Environment();
	return Boolean(
		config.accountId && config.bucketName && config.accessKeyId && config.secretAccessKey
	);
}

export function getR2Config(): R2Config {
	const config = getR2Environment();
	if (!config.accountId || !config.bucketName || !config.accessKeyId || !config.secretAccessKey) {
		throw new Error(
			'R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be configured'
		);
	}

	return {
		accountId: config.accountId,
		bucketName: config.bucketName,
		accessKeyId: config.accessKeyId,
		secretAccessKey: config.secretAccessKey,
		publicBaseUrl: config.publicBaseUrl
	};
}

export function getR2Bucket(): Bucket {
	const { bucketName } = getR2Config();

	return {
		provider: 'r2',
		id: R2_BUCKET_ID,
		githubRepoName: null,
		githubRepoFullName: null,
		displayName: 'Cloudflare R2',
		fileCount: null,
		totalSizeBytes: null,
		maxFiles: null,
		maxSizeBytes: null,
		status: 'available',
		createdAt: '',
		updatedAt: '',
		r2BucketName: bucketName
	};
}
