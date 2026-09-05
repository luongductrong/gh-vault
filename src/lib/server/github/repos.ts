import type { GitHubRepoResponse } from './types.js';
import { parseRateLimitHeaders, checkRateLimit } from './rate-limit.js';

const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

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
 * Create a new repository under the authenticated user's account.
 * POST /user/repos — works with Fine-grained PAT (requires Administration: R/W).
 */
export async function createRepo(
	token: string,
	name: string,
	isPrivate = false,
	owner: string,
	type: 'P' | 'O' = 'P'
): Promise<GitHubRepoResponse> {
	const endpoint = type === 'O' ? `/orgs/${owner}/repos` : `/user/repos`;
	const res = await fetch(`${GITHUB_API}${endpoint}`, {
		method: 'POST',
		headers: ghHeaders(token),
		body: JSON.stringify({
			name,
			private: isPrivate,
			auto_init: true, // Creates initial commit — required for Contents API to work
			has_issues: false,
			has_projects: false,
			has_wiki: false,
			description: `gh-vault CDN bucket: ${name}`
		})
	});

	const rateLimit = parseRateLimitHeaders(res.headers);
	checkRateLimit(rateLimit);

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(
			`Failed to create repo "${name}" in ${type === 'O' ? `org ${owner}` : 'personal account'} (${res.status}): ${errorText}`
		);
	}

	return res.json();
}

/**
 * Fetch repository details.
 */
export async function getRepo(
	token: string,
	owner: string,
	repo: string
): Promise<GitHubRepoResponse> {
	const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}`, {
		method: 'GET',
		headers: ghHeaders(token)
	});

	const rateLimit = parseRateLimitHeaders(res.headers);
	checkRateLimit(rateLimit);

	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Failed to get repo "${owner}/${repo}" (${res.status}): ${errorText}`);
	}

	return res.json();
}
