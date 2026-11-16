import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { preflight, prepareArtifacts, requireNewer } from './release'

test('all five configurations pass, but mismatched tags and unknown apps do not', async () => {
  for (const app of ['dpp', 'lawyers', 'prisons', 'police', 'courts']) {
    const config = JSON.parse(await readFile(new URL(`../../apps/${app}/src-tauri/tauri.conf.json`, import.meta.url), 'utf8'))
    assert.equal(preflight(app, config, `${app}-v${config.version}`), config.version)
    assert.throws(() => preflight(app, config, `${app}-v99.0.0`), /tag/)
    const unsigned = structuredClone(config)
    unsigned.plugins.updater.pubkey = ''
    assert.throws(() => preflight(app, unsigned), /key/)
  }
  assert.throws(() => preflight('unknown', {}), /not enabled/)
})

test('updater advancement rejects replacements, rollback and malformed versions', () => {
  for (const next of ['0.1.3', '0.2.0', '1.0.0']) requireNewer(next, { version: '0.1.2' })
  for (const next of ['0.1.2', '0.1.1', '0.0.9', '01.2.3', '0.1.3-beta']) {
    assert.throws(() => requireNewer(next, { version: '0.1.2' }))
  }
})

test('candidate validation hashes exact bytes and rejects unsafe update references', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pleadli-candidate-'))
  const exe = 'Pleadli.Police_0.1.3_x64-setup.exe'
  const msi = 'Pleadli.Police_0.1.3_x64_en-US.msi'
  const entry = (name: string) => ({ url: `https://github.com/phe-rus/pleadli-releases/releases/download/police-v0.1.3/${name}`, signature: `fixture-${name}` })
  const feed = { version: '0.1.3', platforms: { 'windows-x86_64-nsis': entry(exe), 'windows-x86_64-msi': entry(msi) } }
  const saveFeed = () => writeFile(join(directory, 'latest.json'), JSON.stringify(feed))
  try {
    for (const name of [exe, msi]) {
      await writeFile(join(directory, name), `installer fixture ${name}`)
      await writeFile(join(directory, `${name}.sig`), `fixture-${name}\n`)
    }
    await saveFeed()
    await prepareArtifacts('police', directory, '0.1.3')
    const sums = await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8')
    const hash = createHash('sha256').update(await readFile(join(directory, exe))).digest('hex')
    assert.ok(sums.includes(`${hash}  ${exe}\n`))
    assert.equal(sums.trim().split('\n').length, 5)
    feed.platforms['windows-x86_64-nsis'].url = 'https://example.test/replaced.exe'
    await saveFeed()
    await assert.rejects(prepareArtifacts('police', directory, '0.1.3'), /URL/)
    feed.platforms['windows-x86_64-nsis'] = entry(exe)
    feed.platforms['windows-x86_64-msi'].signature = 'different-signature'
    await saveFeed()
    await assert.rejects(prepareArtifacts('police', directory, '0.1.3'), /signature file disagree/)
    feed.platforms['windows-x86_64-msi'] = entry(msi)
    await saveFeed()
    await rm(join(directory, msi))
    await assert.rejects(prepareArtifacts('police', directory, '0.1.3'), /missing/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
