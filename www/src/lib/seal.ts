import { x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

/** The browser's half of Orchestra backups (docs/platform/ORCHESTRA-BACKUP.md):
 * the institution's recovery phrase and backup key, and the seal that locks a
 * storage secret to one computer. packages/node-core/src/backup.rs is the
 * apps' half; both follow packages/node-core/tests/seal-vectors.json. */

const text = new TextEncoder()
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export function base64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

function base32(bytes: Uint8Array) {
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

function unbase32(s: string) {
  const out: number[] = []
  let bits = 0
  let value = 0
  for (const c of s) {
    const v = ALPHABET.indexOf(c)
    if (v < 0) return null
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Uint8Array.from(out)
}

/** A new phrase: 16 random bytes and a 4-byte checksum, as 8 groups of 4. */
export function newRecoveryPhrase(entropy = crypto.getRandomValues(new Uint8Array(16))) {
  const all = new Uint8Array(20)
  all.set(entropy)
  all.set(sha256(entropy).subarray(0, 4), 16)
  return base32(all).match(/.{4}/g)!.join('-')
}

/** The 16 bytes behind a typed phrase, or null when it was mistyped. */
export function readRecoveryPhrase(typed: string) {
  const clean = typed.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '')
  if (clean.length !== 32) return null
  const all = unbase32(clean)
  if (!all || all.length !== 20) return null
  const entropy = all.subarray(0, 16)
  const check = sha256(entropy).subarray(0, 4)
  return check.every((b, i) => b === all[16 + i]) ? entropy.slice() : null
}

/** The institution's backup key from its phrase. Only the public half leaves the browser. */
export function institutionKey(entropy: Uint8Array) {
  const secretKey = hkdf(sha256, entropy, text.encode('pleadli/backup-key/v1'), new Uint8Array(0), 32)
  const publicKey = x25519.getPublicKey(secretKey)
  return { secretKey, publicKey, fingerprint: keyFingerprint(publicKey) }
}

export function keyFingerprint(publicKey: Uint8Array) {
  return hex(sha256(publicKey).subarray(0, 8)).match(/.{4}/g)!.join(' ')
}

async function aesKey(shared: Uint8Array, ephemeral: Uint8Array, recipient: Uint8Array) {
  const salt = new Uint8Array(64)
  salt.set(ephemeral)
  salt.set(recipient, 32)
  const raw = hkdf(sha256, shared, salt, text.encode('pleadli/seal/v1'), 32)
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** Seal v1: only the holder of `recipient`'s secret key can open it, and only
 * under the same `context`. `ephemeral` and `nonce` are for test vectors only. */
export async function seal(recipient: Uint8Array, plaintext: Uint8Array, context: string, ephemeral = x25519.utils.randomSecretKey(), nonce = crypto.getRandomValues(new Uint8Array(12))) {
  const E = x25519.getPublicKey(ephemeral)
  const key = await aesKey(x25519.getSharedSecret(ephemeral, recipient), E, recipient)
  const c = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: text.encode(context) }, key, new Uint8Array(plaintext)))
  const out = new Uint8Array(1 + 32 + 12 + c.length)
  out[0] = 1
  out.set(E, 1)
  out.set(nonce, 33)
  out.set(c, 45)
  return base64url(out)
}

/** Opens a seal; throws when the key or the context is wrong. */
export async function openSeal(secretKey: Uint8Array, sealed: string, context: string) {
  const bytes = fromBase64url(sealed)
  if (bytes[0] !== 1 || bytes.length < 45 + 16) throw new Error('Not a Pleadli seal.')
  const E = bytes.subarray(1, 33)
  const recipient = x25519.getPublicKey(secretKey)
  const key = await aesKey(x25519.getSharedSecret(secretKey, E), E, recipient)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(33, 45), additionalData: text.encode(context) }, key, bytes.subarray(45)))
}

export const storageContext = (storageId: string, computerId: string) => `pleadli/storage/${storageId}/${computerId}`

/** A folder or drive is reached without a secret; the other storages need one. */
export const needsSecret = (kind: string) => kind !== 'folder'
