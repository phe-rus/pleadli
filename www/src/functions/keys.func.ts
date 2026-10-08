import { CERT, publicKey } from '@/lib/orchestra-signing'
import root from '@/lib/orchestra-root-public-key.json'
import { AdminMiddleware } from '@/middlewares/admin'
import { createServerFn } from '@tanstack/react-start'

const unb64 = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)), (c) => c.charCodeAt(0))

/** How a key is shown to people: the first 8 bytes of its SHA-256, in groups of 4. */
async function fingerprint(b64: string) {
  const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', unb64(b64)))].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.match(/.{4}/g)!.join(' ')
}

/** Pleadli's two signing keys, as staff need to see them: whether the apps
 * will trust the licences pleadli.com signs today (the root key vouches for
 * the online key), and which keys those are. Nothing secret is read here. */
export const getSigningKeys = createServerFn({ method: 'GET' })
  .middleware([AdminMiddleware])
  .handler(async () => {
    const online = await publicKey()
    let certFor: string | null = null
    let issuedAt: number | null = null
    let rootSigned = false
    if (CERT && root.publicKey) {
      const payload = unb64(CERT.payload)
      const key = await crypto.subtle.importKey('raw', unb64(root.publicKey), { name: 'Ed25519' }, false, ['verify'])
      rootSigned = await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64(CERT.signature), payload)
      const body = JSON.parse(new TextDecoder().decode(payload)) as { publicKey?: string; issuedAt?: number }
      certFor = body.publicKey ?? null
      issuedAt = body.issuedAt ?? null
    }
    const matches = certFor !== null && unb64(certFor).join() === unb64(online).join()
    return {
      // The apps trust licences only when all three hold.
      trusted: rootSigned && matches,
      hasRoot: !!root.publicKey,
      rootSigned,
      matches,
      keyId: CERT?.key ?? null,
      issuedAt,
      rootFingerprint: root.publicKey ? await fingerprint(root.publicKey) : null,
      onlineFingerprint: await fingerprint(online),
    }
  })
