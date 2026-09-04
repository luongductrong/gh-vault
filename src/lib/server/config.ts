import { env } from '$env/dynamic/private';

export function getGitHubConfig() {
	const pat = env.GITHUB_PAT;
	const owner = env.GITHUB_OWNER;

	if (!pat || !owner) {
		throw new Error('GITHUB_PAT and GITHUB_OWNER must be configured');
	}

	return { pat, owner };
}

export function getAuthConfig() {
	const password = env.APP_PASSWORD;
	const jwtSecret = env.APP_JWT_SECRET;

	if (!password || !jwtSecret) {
		throw new Error('APP_PASSWORD and APP_JWT_SECRET must be configured');
	}

	return { password, jwtSecret };
}
