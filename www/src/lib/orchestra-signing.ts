import { env } from 'cloudflare:workers'
import certificate from './orchestra-key-cert.json'

/** Pleadli's online signing key: Ed25519, the private half the Worker secret
 * ORCHESTRA_SIGNING_KEY (PKCS#8 in base64). Its certificate, signed by the
 * offline root key whose public half the apps embed, travels with every
 * signed answer, so a lost or leaked online key is replaced without an app
 * update (www/scripts/orchestra-keys.ts). Null until the root has certified it. */
export const CERT = certificate as Signed | null
export const KEY_ID = CERT?.key ?? 'orchestra-uncertified'

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
export const b64url = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (text: string) => Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0))

let signingKey: Promise<CryptoKey> | undefined
function key() {
  if (!env.ORCHESTRA_SIGNING_KEY) throw new Error('ORCHESTRA_SIGNING_KEY is not set')
  signingKey ??= crypto.subtle.importKey('pkcs8', unb64(env.ORCHESTRA_SIGNING_KEY), { name: 'Ed25519' }, true, ['sign'])
  return signingKey
}

/** The public key as raw 32 bytes in base64, as the apps embed it. */
export async function publicKey() {
  const jwk = await crypto.subtle.exportKey('jwk', await key())
  const x = jwk.x!.replace(/-/g, '+').replace(/_/g, '/')
  return x + '='.repeat((4 - (x.length % 4)) % 4)
}

/** A signed statement: the JSON payload as base64url bytes, and the Ed25519
 * signature over exactly those bytes. Apps check the signature, then parse. */
export type Signed = { key: string; payload: string; signature: string; cert?: Signed | null }

export async function sign(payload: unknown): Promise<Signed> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, await key(), bytes))
  return { key: KEY_ID, payload: b64url(bytes), signature: b64url(signature), cert: CERT }
}

/** A random secret for an app to hold, and the hash pleadli.com keeps. */
export function newToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)))
}
