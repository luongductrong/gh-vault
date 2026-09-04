import type { RateLimitInfo } from './types.js';

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
	return {
		limit: parseInt(headers.get('x-ratelimit-limit') ?? '5000', 10),
		remaining: parseInt(headers.get('x-ratelimit-remaining') ?? '5000', 10),
		reset: new Date(parseInt(headers.get('x-ratelimit-reset') ?? '0', 10) * 1000),
		used: parseInt(headers.get('x-ratelimit-used') ?? '0', 10)
	};
}

export function checkRateLimit(info: RateLimitInfo): void {
	if (info.remaining === 0) {
		const waitMs = Math.max(0, info.reset.getTime() - Date.now());
		const waitMin = Math.ceil(waitMs / 60000);
		throw new Error(
			`GitHub API rate limit exceeded. Resets in ${waitMin} minute(s) at ${info.reset.toISOString()}`
		);
	}

	if (info.remaining < 100) {
		console.warn(
			`[GitHub Rate Limit] Low remaining: ${info.remaining}/${info.limit}. Resets at ${info.reset.toISOString()}`
		);
	}
}
