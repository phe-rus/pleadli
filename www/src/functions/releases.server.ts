export const RELEASE_APPS = ['police', 'dpp', 'courts', 'lawyers', 'prisons'] as const
export type ReleaseApp = (typeof RELEASE_APPS)[number]

const REPO = 'https://github.com/phe-rus/pleadli-releases/releases'

export type Installer = { url: string; sizeBytes: number }
export type ReleaseRequest = (url: string, options?: RequestInit) => Promise<Response>
export type ReleaseAvailability =
  | { status: 'available'; version: string; publishedAt: string; releaseUrl: string; installer: Installer; msi: Installer | null }
  | { status: 'missing' | 'unavailable' }

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function installer(value: unknown, tag: string, suffix: string): Installer | null {
  const asset = record(value)
  if (typeof asset.name !== 'string' || !asset.name.endsWith(suffix)) return null
  if (typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size <= 0) return null
  if (typeof asset.browser_download_url !== 'string') return null
  // Never let upstream metadata turn the download action into another host,
  // repository, version, query or fragment. Only versioned public assets qualify.
  const expected = `${REPO}/download/${tag}/${encodeURIComponent(asset.name)}`
  if (asset.browser_download_url !== expected) return null
  return { url: expected, sizeBytes: asset.size }
}

/** Both the installed app's feed and the versioned release must agree. */
export async function fetchRelease(app: ReleaseApp, request: ReleaseRequest = fetch): Promise<ReleaseAvailability> {
  // One deadline covers the feed, release metadata and body reads together.
  const signal = AbortSignal.timeout(6000)
  const options = {
    signal,
    headers: { 'User-Agent': 'Pleadli-downloads', Accept: 'application/json' },
    cf: { cacheTtl: 300, cacheEverything: true },
  } as RequestInit
  try {
    const feedResponse = await request(`${REPO}/download/${app}-latest/latest.json`, options)
    if (feedResponse.status === 404) return { status: 'missing' }
    if (!feedResponse.ok) return { status: 'unavailable' }
    const feed = record(await feedResponse.json())
    if (typeof feed.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(feed.version) || feed.version === '0.0.0') return { status: 'unavailable' }
    const tag = `${app}-v${feed.version}`
    const response = await request(`https://api.github.com/repos/phe-rus/pleadli-releases/releases/tags/${tag}`, options)
    if (!response.ok) return { status: 'unavailable' }
    const release = record(await response.json())
    if (release.tag_name !== tag || release.draft !== false || release.prerelease !== false) return { status: 'unavailable' }
    if (typeof release.published_at !== 'string' || !Number.isFinite(Date.parse(release.published_at)) || !Array.isArray(release.assets)) return { status: 'unavailable' }
    const exe = release.assets.map((asset) => installer(asset, tag, `_${feed.version}_x64-setup.exe`)).find(Boolean)
    if (!exe) return { status: 'unavailable' }
    const msi = release.assets.map((asset) => installer(asset, tag, `_${feed.version}_x64_en-US.msi`)).find(Boolean) ?? null
    return { status: 'available', version: feed.version, publishedAt: release.published_at, releaseUrl: `${REPO}/tag/${tag}`, installer: exe, msi }
  } catch {
    return { status: 'unavailable' }
  }
}
