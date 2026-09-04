import { parseRateLimitHeaders, checkRateLimit } from './rate-limit.js';
import type { GitHubContentResponse, GitHubDirectoryItem } from './types.js';

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const CDN_BASE = 'https://cdn.jsdelivr.net/gh';

function ghHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': API_VERSION,
		'User-Agent': 'gh-vault'
	};
}

/**
 * Upload (create) a file via the Contents API.
 * PUT /repos/{owner}/{repo}/contents/{path}
 *
 * The `content` parameter must be a raw Base64 string (no data URI prefix).
 */
export async function uploadFile(
	token: string,
	owner: string,
	repo: string,
	path: string,
	contentBase64: string,
	commitMessage: string
): Promise<{ fileSha: string; commitSha: string }> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
		method: 'PUT',
		headers: ghHeaders(token),
		body: JSON.stringify({
			message: commitMessage,
			content: contentBase64
		})
	});

	const rateLimit = parseRateLimitHeaders(res.headers);
	checkRateLimit(rateLimit);

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to upload file "${path}" (${res.status}): ${errorText}`);
	}

	const data: GitHubContentResponse = await res.json();
	return {
		fileSha: data.content.sha,
		commitSha: data.commit.sha
	};
}

/**
 * List files in a directory via the Contents API.
 * GET /repos/{owner}/{repo}/contents/{path}
 *
 * Note: Limited to 1000 items per directory by GitHub.
 */
export async function listFiles(
	token: string,
	owner: string,
	repo: string,
	path = ''
): Promise<GitHubDirectoryItem[]> {
	const encodedPath = path ? `/${path}` : '';
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents${encodedPath}`, {
		method: 'GET',
		headers: ghHeaders(token)
	});

	const rateLimit = parseRateLimitHeaders(res.headers);
	checkRateLimit(rateLimit);

	if (!res.ok) {
		if (res.status === 404) return []; // Empty repo or path not found
		const errorText = await res.text();
		throw new Error(`Failed to list files at "${path}" (${res.status}): ${errorText}`);
	}

	const data = await res.json();
	return Array.isArray(data) ? data : [data];
}

/**
 * Build a jsDelivr CDN URL pinned to a specific commit SHA.
 * Using commit SHA (not branch) ensures the URL is permanently cacheable.
 */
export function buildCdnUrl(owner: string, repo: string, commitSha: string, path: string): string {
	return `${CDN_BASE}/${owner}/${repo}@${commitSha}/${path}`;
}
