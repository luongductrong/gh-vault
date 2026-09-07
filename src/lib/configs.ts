export const R2_BUCKET_ID = 'r2' as const;

export const UPLOAD_LIMITS = {
	github: 4 * 1024 * 1024,
	r2: 20 * 1024 * 1024
} as const;

export const MAX_FILENAME_LENGTH = 255;

export const R2_PRESIGNED_URL_TTL_SECONDS = 5 * 60;
export const R2_OBJECT_PREFIX = 'images/';
export const R2_CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const R2_DEFAULT_MIME_TYPE = 'application/octet-stream';
