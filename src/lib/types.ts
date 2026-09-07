export type StorageProvider = 'github' | 'r2';

export interface Bucket {
	provider: StorageProvider;
	id: string;
	githubRepoName: string | null;
	githubRepoFullName: string | null;
	displayName: string | null;
	fileCount: number | null;
	totalSizeBytes: number | null;
	maxFiles: number | null;
	maxSizeBytes: number | null;
	status: string;
	createdAt: string;
	updatedAt: string;
	r2BucketName?: string;
}

export interface FileItem {
	provider: StorageProvider;
	id: string;
	bucketId: string;
	originalName: string;
	storedName: string;
	cdnUrl: string;
	sizeBytes: number;
	mimeType: string | null;
	createdAt: string;
	githubPath?: string;
	githubFileSha?: string;
	commitSha?: string;
	key?: string;
	etag?: string;
}

export interface R2UploadInit {
	key: string;
	filename: string;
	uploadUrl: string;
	expiresAt: string;
	headers: Record<string, string>;
}
