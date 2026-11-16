import { appendFile, readFile, readdir, lstat, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const apps = ['dpp', 'lawyers', 'prisons', 'police', 'courts']
const releases = 'https://github.com/phe-rus/pleadli-releases/releases'
const root = fileURLToPath(new URL('../../', import.meta.url))
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function version(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value) || value === '0.0.0') throw new Error('A nonzero stable x.y.z version is required.')
  return value
}

export function preflight(app: string, raw: unknown, tag = ''): string {
  if (!apps.includes(app)) throw new Error(`App is not enabled for public releases: ${app}`)
  const config = object(raw)
  const releaseVersion = version(config.version)
  if (tag && tag !== `${app}-v${releaseVersion}`) throw new Error('Release tag does not match the app and configured version.')
  const bundle = object(config.bundle)
  if (bundle.active !== true || bundle.createUpdaterArtifacts !== true) throw new Error('Bundling and signed updater artifacts must be enabled.')
  const targets = bundle.targets
  if (targets !== 'all' && !(Array.isArray(targets) && ['nsis', 'msi'].every((target) => targets.includes(target)))) throw new Error('Both Windows NSIS and MSI bundles are required.')
  const updater = object(object(config.plugins).updater)
  if (typeof updater.pubkey !== 'string' || !updater.pubkey.trim()) throw new Error('The updater public key is missing.')
  const expected = `${releases}/download/${app}-latest/latest.json`
  if (!Array.isArray(updater.endpoints) || updater.endpoints.length !== 1 || updater.endpoints[0] !== expected) throw new Error('The updater must use this app’s fixed public feed.')
  return releaseVersion
}

export function requireNewer(candidate: string, previous: unknown): void {
  const next = version(candidate).split('.').map(BigInt)
  const current = version(object(previous).version).split('.').map(BigInt)
  for (let i = 0; i < 3; i++) {
    if (next[i] > current[i]) return
    if (next[i] < current[i]) break
  }
  throw new Error('The candidate must be newer than the current updater feed. Refusing a rollback or replacement.')
}

/** Checks downloaded draft assets, then hashes their exact bytes. This is not
 * Windows publisher verification or cryptographic verification of updater signatures. */
export async function prepareArtifacts(app: string, directory: string, releaseVersion: string): Promise<void> {
  if (!apps.includes(app)) throw new Error('Unknown release app.')
  version(releaseVersion)
  const names = (await readdir(directory)).filter((name) => name !== 'SHA256SUMS.txt').sort()
  if (!names.every((name) => /^[A-Za-z0-9._-]+$/.test(name))) throw new Error('Unexpected release asset name.')
  const prefix = `pleadli.${app}_${releaseVersion}_x64`
  const exe = names.find((name) => name.toLowerCase() === `${prefix}-setup.exe`)
  const msi = names.find((name) => name.toLowerCase() === `${prefix}_en-us.msi`)
  if (!exe || !msi || !names.includes('latest.json')) throw new Error('The draft is missing its EXE, MSI or update feed.')
  for (const name of [exe, msi]) {
    if (!names.includes(`${name}.sig`) || (await lstat(join(directory, name))).size === 0) throw new Error(`Missing signature file or empty installer: ${name}`)
  }
  const feed = object(JSON.parse(await readFile(join(directory, 'latest.json'), 'utf8')))
  if (feed.version !== releaseVersion) throw new Error('The update feed version does not match the candidate.')
  const platforms = object(feed.platforms)
  const referenced = new Set<string>()
  for (const [platform, raw] of Object.entries(platforms)) {
    if (!/^windows-x86_64(?:-msi|-nsis)?$/.test(platform)) throw new Error(`Unexpected update platform: ${platform}`)
    const entry = object(raw)
    const name = [exe, msi].find((asset) => entry.url === `${releases}/download/${app}-v${releaseVersion}/${asset}`)
    if (!name) throw new Error('An update URL does not point at this candidate installer.')
    const signature = (await readFile(join(directory, `${name}.sig`), 'utf8')).trim()
    if (!signature || entry.signature !== signature) throw new Error('The update feed and signature file disagree.')
    referenced.add(name)
  }
  if (referenced.size !== 2) throw new Error('The update feed must cover both installers.')
  const hashes: string[] = []
  for (const name of names) {
    if (!(await lstat(join(directory, name))).isFile()) throw new Error('Release assets must be regular files.')
    hashes.push(`${createHash('sha256').update(await readFile(join(directory, name))).digest('hex')}  ${name}`)
  }
  await writeFile(join(directory, 'SHA256SUMS.txt'), `${hashes.join('\n')}\n`)
}

if (import.meta.main) {
  try {
    const [command, app, argument, extra] = process.argv.slice(2)
    if (command === 'preflight' && app && extra === undefined) {
      if (!apps.includes(app)) throw new Error('Unknown release app.')
      const config = JSON.parse(await readFile(join(root, 'apps', app, 'src-tauri/tauri.conf.json'), 'utf8'))
      const result = preflight(app, config, argument)
      console.log(`${app}: release configuration passed, version ${result}`)
      if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `version=${result}\n`)
    } else if (command === 'artifacts' && app && argument && extra) {
      await prepareArtifacts(app, argument, extra)
      console.log('Draft installers, update references and signature files agree; SHA256SUMS.txt written.')
    } else if (command === 'advance' && app && argument && extra === undefined) {
      requireNewer(app, JSON.parse(await readFile(argument, 'utf8')))
      console.log('Candidate advances the current update version.')
    } else {
      throw new Error('Usage: release.ts preflight <app> [tag] | artifacts <app> <directory> <version> | advance <version> <previous-feed>')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release validation failed.')
    process.exitCode = 1
  }
}
