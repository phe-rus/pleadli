import { mock, test } from 'bun:test'
import assert from 'node:assert/strict'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readFile } from 'node:fs/promises'

test('real signup cannot claim platform admin; trusted admin provisioning still works', async () => {
  const sqlite = new Database(':memory:')
  sqlite.exec(await readFile(new URL('../.migrations/0000_deep_mongu.sql', import.meta.url), 'utf8'))
  mock.module('../src/db', () => ({ db: drizzle(sqlite) }))
  mock.module('cloudflare:workers', () => ({ env: {
    BETTER_AUTH_URL: 'http://localhost:3000',
    BETTER_AUTH_SECRET: 'isolated-signup-test-secret-with-more-than-thirty-two-characters',
    // The old code would promote this first account solely by this address.
    PLEADLI_STAFF_EMAILS: 'pleadli@pleadli.com',
  } }))
  const { auth } = await import('../src/auth')
  const post = (path: string, body: unknown, cookie?: string) => auth.handler(new Request(`http://localhost:3000/api/auth${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }))
  try {
    const signup = await post('/sign-up/email', { name: 'Test staff claim', email: 'pleadli@pleadli.com', password: 'test-password-2026' })
    assert.equal(signup.status, 200, await signup.clone().text())
    const account = await signup.json() as { user: { id: string; role: string; emailVerified: boolean } }
    assert.equal(account.user.role, 'user', 'even the first staff-address signup is ordinary')
    assert.equal(account.user.emailVerified, false)
    const cookie = signup.headers.get('set-cookie')?.split(';')[0]
    assert.ok(cookie)
    const denied = await post('/admin/create-user', { name: 'Escalated', email: 'escalated@example.test', password: 'test-password-2026', role: 'admin' }, cookie)
    assert.equal(denied.status, 403, await denied.clone().text())
    const anonymous = await post('/admin/create-user', { name: 'Anonymous', email: 'anonymous@example.test', password: 'test-password-2026', role: 'admin' })
    assert.equal(anonymous.status, 401)
    const injected = await post('/sign-up/email', { name: 'Role injection', email: 'injected@example.test', password: 'test-password-2026', role: 'admin' })
    assert.ok([200, 400].includes(injected.status))
    const injectedRow = sqlite.query<{ role: string }, []>("SELECT role FROM user WHERE email = 'injected@example.test'").get()
    assert.ok(!injectedRow || injectedRow.role === 'user')

    // This is an isolated test fixture, never an operator or production action.
    sqlite.query('UPDATE user SET role = ? WHERE id = ?').run('admin', account.user.id)
    const signin = await post('/sign-in/email', { email: 'pleadli@pleadli.com', password: 'test-password-2026' })
    assert.equal(signin.status, 200)
    const adminCookie = signin.headers.get('set-cookie')?.split(';')[0]
    assert.ok(adminCookie)
    const created = await post('/admin/create-user', { name: 'Provisioned', email: 'provisioned@example.test', password: 'test-password-2026', role: 'admin' }, adminCookie)
    assert.equal(created.status, 200, await created.clone().text())
    assert.equal((sqlite.query<{ role: string }, []>("SELECT role FROM user WHERE email = 'provisioned@example.test'").get())?.role, 'admin')
  } finally {
    sqlite.close()
    mock.restore()
  }
})
