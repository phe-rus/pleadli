import { getSigningKeys } from '@/functions/keys.func'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/signing-key')({
  loader: () => getSigningKeys(),
  component: RouteComponent,
})

/** Pleadli's signing keys in plain words: are licences trusted by the apps,
 * and what to do if a key is lost. */
function RouteComponent() {
  const k = Route.useLoaderData()

  return (
    <article className="container flex flex-col gap-8 py-10 md:max-w-3xl">
      <header>
        <h1>Signing key</h1>
        <p className="text-muted-foreground">Every licence pleadli.com gives a computer is signed, so the apps know it really came from Pleadli. This page says whether that is working.</p>
      </header>

      <div className={k.trusted ? 'rounded-xl bg-emerald-500/10 p-5 text-emerald-800 dark:text-emerald-300' : 'rounded-xl bg-destructive/10 p-5 text-destructive'}>
        <strong>{k.trusted ? 'Working. The apps trust the licences pleadli.com signs.' : 'Not working. The apps will not trust new licences.'}</strong>
        {!k.trusted && (
          <p className="mt-1">
            {!k.hasRoot ? 'The root key has not been made yet.' : !k.rootSigned ? 'The certificate is not signed by the root key the apps know.' : 'The certificate is for a different online key than the one pleadli.com uses now.'} Ask the developer to run the
            certify step and deploy.
          </p>
        )}
      </div>

      <Group title="The two keys">
        <GroupRow label="Root key" detail="Kept offline on a USB stick. It never touches pleadli.com. The apps have its public half built in." value={k.rootFingerprint ?? 'Not made'} />
        <GroupRow label="Online key" detail="Lives on pleadli.com and signs licences every day. The root key vouches for it." value={k.onlineFingerprint} />
        <GroupRow label="Vouched for since" detail={k.keyId ?? undefined} value={k.issuedAt ? new Date(k.issuedAt).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Never'} />
      </Group>

      <Group title="If something goes wrong">
        <GroupRow label="pleadli.com is broken into, or the online key leaks" detail="Make a new online key with the root key (the developer runs one command with the USB stick plugged in, then deploys). Computers keep working; no app update is needed." />
        <GroupRow label="The USB stick with the root key is lost" detail="Use the second copy. If both are lost, a new root key means every app needs an update, so keep two copies in two places." />
      </Group>
    </article>
  )
}
