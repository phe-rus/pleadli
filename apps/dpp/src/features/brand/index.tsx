import { useBrand } from '@/features/installation'
import { activeJurisdiction } from '@/lib/jurisdiction'
import { cn } from '@pleadli/ui/lib/utils'

/** The institution's crest. Set at first-launch setup (or later in Settings,
 * Office) and kept with the installation, so every computer of the office
 * shows the same one and printed documents carry it. Until then, the
 * department's own crest. */

/** Uganda's ODPP crest, shown to Ugandan offices until they set their own. */
const UGANDA_CREST = '/brand/default-logo.png'
/** Pleadli's own mark: for every other country, since a crest must never be
 * another country's. Before setup the default is Uganda's, the country setup
 * starts on. */
const PLEADLI_MARK = '/icon.png'

export function defaultLogo(jurisdiction?: string | null): string {
  const code = jurisdiction ?? activeJurisdiction()?.code
  return !code || code === 'ug' ? UGANDA_CREST : PLEADLI_MARK
}

/** Before anything is known (boot, setup): Uganda, the default country. */
export const DEFAULT_LOGO = UGANDA_CREST

export function useBrandLogo(): string {
  const { data } = useBrand()
  return data?.logo ?? defaultLogo(data?.jurisdiction)
}

export function BrandLogo({ className }: { className?: string }) {
  const src = useBrandLogo()
  return <img src={src} alt="" draggable={false} className={cn('size-5 shrink-0 object-contain', className)} />
}
