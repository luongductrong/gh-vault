export interface Bucket {
	id: string;
	githubRepoName: string;
	githubRepoFullName: string;
	displayName: string | null;
	fileCount: number;
	totalSizeBytes: number;
	maxFiles: number;
	maxSizeBytes: number;
	status: string;
	createdAt: string;
	updatedAt: string;
}

export interface FileItem {
	id: string;
	bucketId: string;
	originalName: string;
	storedName: string;
	githubPath: string;
	githubFileSha: string;
	commitSha: string;
	cdnUrl: string;
	sizeBytes: number;
	mimeType: string | null;
	createdAt: string;
}
