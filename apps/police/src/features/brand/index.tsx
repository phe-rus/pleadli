import { SettingsCard } from '@/components/settings-card'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { useRef, useSyncExternalStore } from 'react'

/** The institution's own logo. Ships with a default (the department's crest)
 * and an administrator may replace it with their own image, kept on this
 * computer as a data URL. Every place that shows the brand reads it here. */

export const DEFAULT_LOGO = '/brand/default-logo.png'
const STORAGE_KEY = 'pleadli:police:logo'
/** Big enough for a crisp crest, small enough for local storage. */
const MAX_LOGO_BYTES = 1024 * 1024

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

function readCustom(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function useBrandLogo(): { src: string; custom: boolean } {
  const custom = useSyncExternalStore(subscribe, readCustom, () => null)
  return { src: custom ?? DEFAULT_LOGO, custom: custom != null }
}

export function setBrandLogo(dataUrl: string | null) {
  if (dataUrl) localStorage.setItem(STORAGE_KEY, dataUrl)
  else localStorage.removeItem(STORAGE_KEY)
  listeners.forEach((listener) => listener())
}

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|svg\+xml|webp)$/.test(file.type)) return reject(new Error('type'))
    if (file.size > MAX_LOGO_BYTES) return reject(new Error('size'))
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('read'))
    reader.readAsDataURL(file)
  })
}

export function BrandLogo({ className }: { className?: string }) {
  const { src } = useBrandLogo()
  return <img src={src} alt="" draggable={false} className={cn('size-5 shrink-0 object-contain', className)} />
}

export type LogoCardLabels = {
  title: string
  description: string
  hint: string
  upload: string
  reset: string
  saved: string
  failed: string
  isDefault: string
  isCustom: string
}

export const logoCardLabelsEn: LogoCardLabels = {
  title: 'Logo',
  description: "Shown in the sidebar, the splash and the sign-in screen. Use your institution's own crest.",
  hint: 'PNG, JPG, SVG or WebP, up to 1 MB. Kept on this computer.',
  upload: 'Upload logo',
  reset: 'Use default',
  saved: 'Logo updated',
  failed: 'Could not use that image',
  isDefault: 'Default logo',
  isCustom: 'Custom logo',
}

/** Settings card: preview, upload, back to the default. */
export function LogoCard({ labels = logoCardLabelsEn }: { labels?: LogoCardLabels }) {
  const { src, custom } = useBrandLogo()
  const input = useRef<HTMLInputElement>(null)
  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      setBrandLogo(await readLogoFile(file))
      t.success(labels.saved)
    } catch {
      t.error(labels.failed)
    }
  }
  return (
    <SettingsCard
      title={labels.title}
      description={labels.description}
      hint={labels.hint}
      action={
        <div className="flex gap-2">
          {custom && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setBrandLogo(null)}>
              {labels.reset}
            </Button>
          )}
          <input ref={input} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          <Button type="button" size="sm" onClick={() => input.current?.click()}>
            {labels.upload}
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <div className="flex size-20 items-center justify-center rounded-lg border border-border bg-white p-2">
          <img src={src} alt="" className="size-full object-contain" />
        </div>
        <p>{custom ? labels.isCustom : labels.isDefault}</p>
      </div>
    </SettingsCard>
  )
}
