#!/usr/bin/env bun
/** Pleadli Orchestra signing keys, two levels (docs/platform/ORCHESTRA-API.md):
 *
 *   root key    offline only (USB stick, printed sheet). Apps embed its PUBLIC
 *               half. It signs one thing: the certificate of the online key.
 *   online key  the Worker secret ORCHESTRA_SIGNING_KEY. Signs licences. Its
 *               certificate, signed by the root, ships in every answer.
 *
 * Lose or leak the online key: run `rotate`, apps keep working, no app update.
 * Lose the root key: every app needs an update, so keep two offline copies.
 *
 * Run it in your own terminal (not through an assistant), from www/:
 *   bun scripts/orchestra-keys.ts init    <offline-folder>   once: root key + certify the current online key
 *   bun scripts/orchestra-keys.ts certify <offline-folder>   certify the online key in .dev.vars again
 *   bun scripts/orchestra-keys.ts rotate  <offline-folder>   new online key, certified, uploaded to Cloudflare
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as edSign } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const WWW = resolve(import.meta.dir, '..')
const REPO = resolve(WWW, '..')
const CERT_FILE = join(WWW, 'src/lib/orchestra-key-cert.json')
const ROOT_PUB_FILE = join(REPO, 'docs/platform/orchestra-root-public-key.txt')
// The same public key for pleadli.com itself (Pleadli staff > Signing key).
const ROOT_PUB_JSON = join(WWW, 'src/lib/orchestra-root-public-key.json')
const DEV_VARS = join(WWW, '.dev.vars')
const ROOT_NAME = 'pleadli-orchestra-root.key'

const [command, folderArg] = process.argv.slice(2)
if (!command || !folderArg || !['init', 'certify', 'rotate'].includes(command)) {
  console.log('usage: bun scripts/orchestra-keys.ts init|certify|rotate <offline-folder>')
  process.exit(1)
}
const folder = resolve(folderArg)
if (folder.startsWith(REPO)) fail('The offline folder must be outside the repository (a USB stick, for example).')
mkdirSync(folder, { recursive: true })

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const pkcs8 = (k: ReturnType<typeof createPrivateKey>) => k.export({ format: 'der', type: 'pkcs8' }).toString('base64')
const rawPublic = (k: ReturnType<typeof createPrivateKey>) => createPublicKey(k).export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64')
const load = (b64: string) => createPrivateKey({ key: Buffer.from(b64.trim(), 'base64'), format: 'der', type: 'pkcs8' })

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function writeSecret(path: string, text: string) {
  if (existsSync(path)) fail(`${path} already exists; not overwriting it.`)
  writeFileSync(path, text)
  chmodSync(path, 0o600)
}

function devVarsKey() {
  const line = readFileSync(DEV_VARS, 'utf8').split('\n').find((l) => l.startsWith('ORCHESTRA_SIGNING_KEY='))
  if (!line) fail('No ORCHESTRA_SIGNING_KEY in www/.dev.vars.')
  return line.slice('ORCHESTRA_SIGNING_KEY='.length).trim()
}

function setDevVarsKey(value: string) {
  const lines = readFileSync(DEV_VARS, 'utf8').split('\n').filter((l) => l && !l.startsWith('ORCHESTRA_SIGNING_KEY='))
  writeFileSync(DEV_VARS, [...lines, `ORCHESTRA_SIGNING_KEY=${value}`, ''].join('\n'))
}

/** The root's statement "this public key is Pleadli's online signing key". */
function certify(rootB64: string, onlineB64: string) {
  const id = `orchestra-${new Date().toISOString().slice(0, 10)}`
  const payload = Buffer.from(JSON.stringify({ v: 1, kind: 'pleadli.signing-key', key: id, publicKey: rawPublic(load(onlineB64)), issuedAt: Date.now() }))
  const cert = { key: id, payload: b64url(payload), signature: b64url(edSign(null, payload, load(rootB64))) }
  writeFileSync(CERT_FILE, JSON.stringify(cert, null, 2) + '\n')
  console.log(`Certificate for ${id} written to ${CERT_FILE} (public; commit it and deploy).`)
}

function backupOnline(onlineB64: string) {
  const path = join(folder, `pleadli-orchestra-online-${new Date().toISOString().replace(/[:.]/g, '-')}.key`)
  writeSecret(path, `PLEADLI ORCHESTRA ONLINE SIGNING KEY (Ed25519, PKCS#8, base64)\nWorker secret ORCHESTRA_SIGNING_KEY\n${onlineB64}\n`)
  console.log(`Online key backed up to ${path}`)
}

function readRoot() {
  const path = join(folder, ROOT_NAME)
  if (!existsSync(path)) fail(`No ${ROOT_NAME} in ${folder}.`)
  return readFileSync(path, 'utf8').split('\n').find((l) => /^[A-Za-z0-9+/=]{40,}$/.test(l.trim()))!.trim()
}

if (command === 'init') {
  if (existsSync(join(folder, ROOT_NAME))) fail(`${folder} already holds a root key. Use certify or rotate.`)
  const root = generateKeyPairSync('ed25519').privateKey
  const rootB64 = pkcs8(root)
  const rootPub = rawPublic(root)
  writeSecret(
    join(folder, ROOT_NAME),
    [
      'PLEADLI ORCHESTRA ROOT KEY (Ed25519, PKCS#8, base64). KEEP OFFLINE. NEVER IN GIT OR CLOUDFLARE.',
      `Public key (built into the apps): ${rootPub}`,
      `Made: ${new Date().toISOString()}`,
      'Print this sheet as well, and keep a second copy in another place.',
      '',
      rootB64,
      '',
    ].join('\n'),
  )
  writeFileSync(ROOT_PUB_FILE, `${rootPub}\n`)
  writeFileSync(ROOT_PUB_JSON, JSON.stringify({ publicKey: rootPub }) + '\n')
  console.log(`Root key written to ${join(folder, ROOT_NAME)}`)
  console.log(`Root PUBLIC key: ${rootPub} (also in ${ROOT_PUB_FILE}, apps embed this one)`)
  const online = devVarsKey()
  backupOnline(online)
  certify(rootB64, online)
} else if (command === 'certify') {
  certify(readRoot(), devVarsKey())
} else {
  const rootB64 = readRoot()
  const online = pkcs8(generateKeyPairSync('ed25519').privateKey)
  backupOnline(online)
  const put = spawnSync('bunx', ['wrangler', 'secret', 'put', 'ORCHESTRA_SIGNING_KEY'], { cwd: WWW, input: online, stdio: ['pipe', 'inherit', 'inherit'] })
  if (put.status !== 0) fail('wrangler secret put failed; nothing else changed. The new key is backed up above.')
  setDevVarsKey(online)
  certify(rootB64, online)
  console.log('Now deploy (bun run deploy) so the new certificate goes out with the new key.')
}
