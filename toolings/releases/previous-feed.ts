import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { apps, requireNewer } from './release'

const repository = 'https://api.github.com/repos/phe-rus/pleadli-releases'
/** Only Courts' explicitly requested first release may have no previous feed.
 * Network errors, API refusals and missing assets never count as a first release. */
export async function previousFeed(app: string, candidate: string, bootstrap: boolean, request: typeof fetch = fetch): Promise<Record<string, unknown>> {
  if (!apps.includes(app)) throw new Error('Unknown release app.')
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`
  const response = await request(`${repository}/releases/tags/${app}-latest`, { headers })
  if (response.status === 404 && app === 'courts' && candidate === '0.1.0' && bootstrap) {
    // Do not bootstrap over an existing public Courts history whose rolling feed was lost.
    const history = await request(`${repository}/releases?per_page=100`, { headers })
    if (!history.ok) throw new Error('Could not verify the first Courts release history.')
    const releases: unknown = await history.json()
    if (!Array.isArray(releases) || releases.length >= 100) throw new Error('Release history needs manual review before Courts bootstrap.')
    if (releases.some(r => r && typeof r === 'object' && 'tag_name' in r && typeof r.tag_name === 'string' && r.tag_name.startsWith('courts-') && !('draft' in r && r.draft === true))) throw new Error('Courts already has release history. Restore its feed before releasing.')
    return { firstRelease: true, version: candidate }
  }
  if (!response.ok) throw new Error(`Previous ${app} release could not be read (HTTP ${response.status}). First Courts release needs the explicit bootstrap switch.`)
  const release = await response.json() as { draft?: boolean; assets?: { name: string; browser_download_url: string }[] }
  if (release.draft) throw new Error('The previous rolling release is still a draft.')
  const url = `https://github.com/phe-rus/pleadli-releases/releases/download/${app}-latest/latest.json`
  if (!release.assets?.some(a => a.name === 'latest.json' && a.browser_download_url === url)) throw new Error('The previous rolling feed asset is missing or unexpected.')
  const feed = await request(url)
  if (!feed.ok) throw new Error(`Previous feed could not be downloaded (HTTP ${feed.status}).`)
  const data = await feed.json() as Record<string, unknown>
  requireNewer(candidate, data)
  return data
}

if (import.meta.main) {
  try {
    const [app, version, file, bootstrap] = process.argv.slice(2)
    if (!app || !version || !file || (bootstrap !== undefined && !['true', 'false'].includes(bootstrap))) throw new Error('Usage: previous-feed.ts <app> <version> <output-file> [true|false]')
    const result = await previousFeed(app, version, bootstrap === 'true')
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(result, null, 2) + '\n')
    console.log(result.firstRelease ? 'Explicit first Courts release verified.' : 'Candidate is newer than the published updater feed.')
  } catch (error) { console.error(error instanceof Error ? error.message : 'Previous feed validation failed.'); process.exitCode = 1 }
}
