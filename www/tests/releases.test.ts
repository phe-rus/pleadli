import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchRelease, type ReleaseRequest } from '../src/functions/releases.server'

const base = 'https://github.com/phe-rus/pleadli-releases/releases'
const tag = 'police-v0.1.2'
const exe = { name: 'Pleadli.Police_0.1.2_x64-setup.exe', size: 26655492, browser_download_url: `${base}/download/${tag}/Pleadli.Police_0.1.2_x64-setup.exe` }
const metadata = { tag_name: tag, draft: false, prerelease: false, published_at: '2026-10-08T03:44:46Z', assets: [exe] }

function fixture(feed: unknown, release: unknown = metadata, statuses = [200, 200]) {
  const calls: { url: string; signal: AbortSignal | null | undefined }[] = []
  const request: ReleaseRequest = async (input, options) => {
    const index = calls.length
    calls.push({ url: String(input), signal: options?.signal })
    return new Response(JSON.stringify(index === 0 ? feed : release), { status: statuses[index] ?? 200, headers: { 'content-type': 'application/json' } })
  }
  return { request, calls }
}

test('offers a versioned installer only when feed and public release agree', async () => {
  const { request, calls } = fixture({ version: '0.1.2' })
  assert.deepEqual(await fetchRelease('police', request), {
    status: 'available', version: '0.1.2', publishedAt: metadata.published_at,
    releaseUrl: `${base}/tag/${tag}`, installer: { url: exe.browser_download_url, sizeBytes: exe.size }, msi: null,
  })
  assert.equal(calls[1]?.url, `https://api.github.com/repos/phe-rus/pleadli-releases/releases/tags/${tag}`)
  assert.ok(calls[0]?.signal instanceof AbortSignal)
  assert.equal(calls[0]?.signal, calls[1]?.signal, 'all network work shares one bounded deadline')
})

test('distinguishes no feed from a service failure without falling back to a listed release', async () => {
  for (const [status, expected] of [[404, 'missing'], [429, 'unavailable'], [500, 'unavailable']] as const) {
    const { request, calls } = fixture({}, metadata, [status])
    assert.deepEqual(await fetchRelease('courts', request), { status: expected })
    assert.equal(calls.length, 1)
  }
})

test('rejects malformed and placeholder feed versions before requesting a release', async () => {
  for (const version of [undefined, 12, 'latest', '../other', '0.0.0', '1.0.0-beta']) {
    const { request, calls } = fixture({ version })
    assert.deepEqual(await fetchRelease('police', request), { status: 'unavailable' })
    assert.equal(calls.length, 1)
  }
})

test('does not offer draft, prerelease, mismatched, invalid-date or assetless releases', async () => {
  for (const change of [{ draft: true }, { prerelease: true }, { tag_name: 'dpp-v0.1.2' }, { published_at: null }, { published_at: 'bad' }, { assets: [] }]) {
    const { request } = fixture({ version: '0.1.2' }, { ...metadata, ...change })
    assert.deepEqual(await fetchRelease('police', request), { status: 'unavailable' })
  }
})

test('refuses foreign, rolling, wrong-version or altered download URLs and invalid sizes', async () => {
  for (const change of [
    { browser_download_url: exe.browser_download_url.replace('github.com', 'example.com') },
    { browser_download_url: exe.browser_download_url.replace(tag, 'police-latest') },
    { browser_download_url: exe.browser_download_url.replace(tag, 'police-v0.1.1') },
    { browser_download_url: `${exe.browser_download_url}?redirect=elsewhere` },
    { size: 0 }, { size: -1 }, { size: '12' },
  ]) {
    const { request } = fixture({ version: '0.1.2' }, { ...metadata, assets: [{ ...exe, ...change }] })
    assert.deepEqual(await fetchRelease('police', request), { status: 'unavailable' })
  }
})

test('an optional MSI must pass the same repository and size validation', async () => {
  const name = 'Pleadli.Police_0.1.2_x64_en-US.msi'
  const msi = { name, size: 36151296, browser_download_url: `${base}/download/${tag}/${name}` }
  const { request } = fixture({ version: '0.1.2' }, { ...metadata, assets: [exe, msi] })
  const result = await fetchRelease('police', request)
  assert.equal(result.status, 'available')
  if (result.status === 'available') assert.deepEqual(result.msi, { url: msi.browser_download_url, sizeBytes: msi.size })
})

test('network and malformed JSON failures become an unavailable state', async () => {
  const requests: ReleaseRequest[] = [async () => { throw new Error('network failure') }, async () => new Response('not json')]
  for (const request of requests) assert.deepEqual(await fetchRelease('police', request), { status: 'unavailable' })
})
