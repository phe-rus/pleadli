/** One mutable stand-in for `cloudflare:workers`' env, shared by the tests that import quota.server.
 * Bun's module mocks are process-wide, so each test file sets the properties it needs on this same object. */
export const env: Record<string, any> = {}
