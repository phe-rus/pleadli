import { useEffect } from 'react'
import { useBrand } from '@/features/installation'
import { cn } from '@pleadli/ui/lib/utils'

/** The practice's own logo. Chosen at first-launch setup (or later in
 * Settings, Practice) and kept with the installation, so every computer of a
 * firm shows the same one and what is printed carries it. Until then the
 * default is Ugandan, as setup starts on Uganda; a practice in another country
 * gets Pleadli's own mark, never another country's crest. */

const UGANDA_CREST = '/brand/default-logo.svg'
const PLEADLI_MARK = '/icon.png'

export function defaultLogo(jurisdiction?: string | null): string {
  return !jurisdiction || jurisdiction === 'ug' ? UGANDA_CREST : PLEADLI_MARK
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

const PRODUCT = 'Pleadli Lawyers'

/** Keeps the window's own marks (tab icon, title) on the practice's logo and
 * name, so a browser tab and the desktop window match what the app shows. */
export function useDocumentBrand(logo: string, officeName?: string | null) {
  useEffect(() => {
    for (const rel of ['icon', 'apple-touch-icon']) {
      let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
      if (!link) {
        link = document.createElement('link')
        link.rel = rel
        document.head.appendChild(link)
      }
      link.removeAttribute('type')
      link.href = logo
    }
  }, [logo])
  useEffect(() => {
    document.title = officeName ? `${officeName} · ${PRODUCT}` : PRODUCT
  }, [officeName])
}
