import {
	DeleteObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
	R2_BUCKET_ID,
	R2_CACHE_CONTROL,
	R2_DEFAULT_MIME_TYPE,
	R2_OBJECT_PREFIX,
	R2_PRESIGNED_URL_TTL_SECONDS,
	UPLOAD_LIMITS
} from '$lib/configs';
import type { FileItem } from '$lib/types';
import { getR2Config } from './config';

let cachedClient: S3Client | null = null;
let cachedClientKey = '';

function getR2Client() {
	const config = getR2Config();
	const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
	const clientKey = `${endpoint}:${config.bucketName}:${config.accessKeyId}`;

	if (!cachedClient || cachedClientKey !== clientKey) {
		cachedClient = new S3Client({
			endpoint,
			forcePathStyle: true,
			region: 'auto',
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey
			}
		});
		cachedClientKey = clientKey;
	}

	return { client: cachedClient, config };
}

function encodeFilename(filename: string): string {
	return Buffer.from(filename, 'utf8').toString('base64url');
}

function decodeFilename(encodedFilename: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(encodedFilename)) {
		throw new Error('Invalid encoded filename');
	}

	const decoded = Buffer.from(encodedFilename, 'base64url').toString('utf8');
	if (
		!decoded ||
		Array.from(decoded).some((char) => {
			const code = char.charCodeAt(0);
			return code <= 0x1f || code === 0x7f;
		})
	) {
		throw new Error('Invalid encoded filename');
	}

	return decoded;
}

function filenameFromKey(key: string): string {
	const encodedFilename = key.slice(key.lastIndexOf('/') + 1);
	if (!encodedFilename) return key;

	try {
		return decodeFilename(encodedFilename);
	} catch {
		// Keep listing objects created outside this app usable as a fallback.
		return encodedFilename;
	}
}

function mimeTypeFromFilename(filename: string): string | null {
	const extension = filename.toLowerCase().match(/\.([a-z0-9]{1,16})$/)?.[1];
	if (!extension) return null;

	const mimeTypes: Record<string, string> = {
		avif: 'image/avif',
		gif: 'image/gif',
		jpeg: 'image/jpeg',
		jpg: 'image/jpeg',
		png: 'image/png',
		svg: 'image/svg+xml',
		webp: 'image/webp'
	};

	return mimeTypes[extension] ?? null;
}

function buildCdnUrl(publicBaseUrl: string | null, key: string): string {
	if (!publicBaseUrl) return '';
	const encodedPath = key
		.split('/')
		.map((part) => encodeURIComponent(part))
		.join('/');
	return `${publicBaseUrl.replace(/\/+$/, '')}/${encodedPath}`;
}

function toFileItem(
	config: ReturnType<typeof getR2Config>,
	object: { Key: string; Size?: number; ETag?: string; LastModified?: Date },
	contentType?: string | null
): FileItem {
	const originalName = filenameFromKey(object.Key);
	const lastModified = object.LastModified ?? new Date(0);

	return {
		provider: 'r2',
		id: object.Key,
		bucketId: R2_BUCKET_ID,
		originalName,
		storedName: object.Key,
		key: object.Key,
		etag: object.ETag?.replace(/^"|"$/g, ''),
		cdnUrl: buildCdnUrl(config.publicBaseUrl, object.Key),
		sizeBytes: object.Size ?? 0,
		mimeType: contentType || mimeTypeFromFilename(originalName),
		createdAt: lastModified.toISOString()
	};
}

export function createR2ObjectKey(filename: string): string {
	return `${R2_OBJECT_PREFIX}${crypto.randomUUID()}_${Date.now()}/${encodeFilename(filename)}`;
}

export function isR2ObjectKey(key: string): boolean {
	const [prefix, objectId, encodedFilename] = key.split('/');
	return (
		prefix === R2_OBJECT_PREFIX.slice(0, -1) &&
		/^[A-Za-z0-9-]+_\d+$/.test(objectId ?? '') &&
		/^[A-Za-z0-9_-]+$/.test(encodedFilename ?? '') &&
		key.length <= 1024 &&
		key.split('/').length === 3
	);
}

export async function listR2Files(): Promise<FileItem[]> {
	const { client, config } = getR2Client();
	const results: FileItem[] = [];
	let continuationToken: string | undefined;

	do {
		const response = await client.send(
			new ListObjectsV2Command({
				Bucket: config.bucketName,
				Prefix: R2_OBJECT_PREFIX,
				ContinuationToken: continuationToken,
				MaxKeys: 1000
			})
		);

		for (const object of response.Contents ?? []) {
			if (!object.Key) continue;
			results.push(
				toFileItem(config, {
					Key: object.Key,
					Size: object.Size,
					ETag: object.ETag,
					LastModified: object.LastModified
				})
			);
		}

		continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
	} while (continuationToken);

	return results;
}

export async function createR2UploadUrl(key: string, contentType: string | null) {
	const { client, config } = getR2Client();
	const resolvedContentType = contentType || R2_DEFAULT_MIME_TYPE;
	const command = new PutObjectCommand({
		Bucket: config.bucketName,
		Key: key,
		ContentType: resolvedContentType,
		CacheControl: R2_CACHE_CONTROL,
		IfNoneMatch: '*'
	});
	const uploadUrl = await getSignedUrl(client, command, {
		expiresIn: R2_PRESIGNED_URL_TTL_SECONDS
	});

	return {
		uploadUrl,
		headers: {
			'Content-Type': resolvedContentType,
			'Cache-Control': R2_CACHE_CONTROL,
			'If-None-Match': '*'
		},
		expiresAt: new Date(Date.now() + R2_PRESIGNED_URL_TTL_SECONDS * 1000).toISOString()
	};
}

function isNotFoundError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
	return (
		candidate.name === 'NotFound' ||
		candidate.name === 'NoSuchKey' ||
		candidate.$metadata?.httpStatusCode === 404
	);
}

export function isR2NotFoundError(error: unknown): boolean {
	return isNotFoundError(error);
}

export async function completeR2Upload(key: string, expectedSize?: number): Promise<FileItem> {
	if (!isR2ObjectKey(key)) throw new Error('Invalid R2 object key');

	const { client, config } = getR2Client();
	const head = await client.send(new HeadObjectCommand({ Bucket: config.bucketName, Key: key }));

	const actualSize = head.ContentLength ?? 0;
	const sizeMismatch = expectedSize !== undefined && actualSize !== expectedSize;
	const exceedsLimit = actualSize > UPLOAD_LIMITS.r2;
	if (sizeMismatch || exceedsLimit) {
		try {
			await deleteR2Object(key);
		} catch (cleanupError) {
			console.error('[R2] Failed to clean up invalid upload:', cleanupError);
		}
		if (exceedsLimit) throw new Error('File exceeds the R2 20MB limit');
		throw new Error('Uploaded file size does not match the requested size');
	}

	return toFileItem(
		config,
		{ Key: key, Size: actualSize, ETag: head.ETag, LastModified: head.LastModified },
		head.ContentType
	);
}

export async function deleteR2Object(key: string): Promise<void> {
	if (!isR2ObjectKey(key)) throw new Error('Invalid R2 object key');
	const { client, config } = getR2Client();
	await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: key }));
}
