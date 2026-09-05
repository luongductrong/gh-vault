// Netlify runs this middleware before the SvelteKit function for the login path.
// Returning undefined continues the request chain without reading or rewriting it.
export default () => undefined;

export const config = {
	path: '/api/auth/login',
	method: 'POST',
	rateLimit: {
		action: 'rate_limit',
		windowLimit: 10,
		windowSize: 60,
		aggregateBy: ['ip', 'domain']
	}
};
