import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const buckets = sqliteTable('buckets', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	githubRepoName: text('github_repo_name').notNull().unique(),
	githubRepoFullName: text('github_repo_full_name').notNull(),
	displayName: text('display_name'),
	fileCount: integer('file_count').notNull().default(0),
	totalSizeBytes: integer('total_size_bytes').notNull().default(0),
	maxFiles: integer('max_files').notNull().default(500),
	maxSizeBytes: integer('max_size_bytes').notNull().default(1073741824), // 1GB
	status: text('status').notNull().default('available'), // 'available' | 'full'
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString()),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const files = sqliteTable('files', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	bucketId: text('bucket_id')
		.notNull()
		.references(() => buckets.id),
	originalName: text('original_name').notNull(),
	storedName: text('stored_name').notNull(),
	githubPath: text('github_path').notNull(),
	githubFileSha: text('github_file_sha').notNull(),
	commitSha: text('commit_sha').notNull(),
	cdnUrl: text('cdn_url').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
	mimeType: text('mime_type'),
	createdAt: text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});
