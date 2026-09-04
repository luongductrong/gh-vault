import { SignJWT, jwtVerify } from 'jose';

const ALGORITHM = 'HS256';
const ISSUER = 'gh-vault';

let cachedSecret: Uint8Array | null = null;

function getSecret(secret: string): Uint8Array {
	if (!cachedSecret) {
		cachedSecret = new TextEncoder().encode(secret);
	}
	return cachedSecret;
}

/**
 * Sign an app session JWT (HMAC/HS256) for authenticated users.
 * This is the app's own token — NOT a GitHub token.
 */
export async function signSessionToken(
	jwtSecret: string,
	expiresIn = '24h'
): Promise<{ token: string; expiresAt: string }> {
	const secret = getSecret(jwtSecret);
	// Calculate approximate expiry for the response
	const hours = parseInt(expiresIn, 10) || 24;
	const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

	const token = await new SignJWT({ role: 'admin' })
		.setProtectedHeader({ alg: ALGORITHM })
		.setIssuer(ISSUER)
		.setSubject('vault-admin')
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(secret);

	return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * Verify an app session JWT. Returns true if valid, false otherwise.
 */
export async function verifySessionToken(token: string, jwtSecret: string): Promise<boolean> {
	try {
		const secret = getSecret(jwtSecret);
		await jwtVerify(token, secret, { issuer: ISSUER });
		return true;
	} catch {
		return false;
	}
}
