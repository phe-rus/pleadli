import { Button } from '@pleadli/ui/button'
import { Download01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReleaseAvailability } from '@/functions/releases.server'
import { getLocale } from '@/paraglide/runtime'
import * as m from '@/paraglide/messages'

export function DownloadActions({ name, availability }: { name: string; availability: ReleaseAvailability }) {
  if (availability.status !== 'available') {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button disabled>{m['downloads.not_available']()}</Button>
        <p className="text-sm text-muted-foreground">
          {availability.status === 'missing' ? m['downloads.missing']() : m['downloads.lookup_failed']()}
        </p>
        {availability.status === 'unavailable' && (
          <a className="text-sm underline underline-offset-4" href="https://github.com/phe-rus/pleadli-releases/releases" target="_blank" rel="noreferrer">
            {m['downloads.view_releases']()}
          </a>
        )}
      </div>
    )
  }

  const locale = getLocale()
  const size = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(availability.installer.sizeBytes / 1_000_000)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(availability.publishedAt))
  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" className="rounded-full px-6" nativeButton={false} render={<a href={availability.installer.url} />} aria-label={`${m['product.download_title']({ name })} · Windows`}>
        <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
        {m['product.download_windows']()}
      </Button>
      <p className="text-xs text-muted-foreground">{m['downloads.metadata']({ version: availability.version, size, date })}</p>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        <a className="underline underline-offset-4" href={availability.releaseUrl} target="_blank" rel="noreferrer">{m['downloads.release_notes']()}</a>
        {availability.msi && <a className="underline underline-offset-4" href={availability.msi.url}>{m['downloads.msi']()}</a>}
      </div>
    </div>
  )
}
