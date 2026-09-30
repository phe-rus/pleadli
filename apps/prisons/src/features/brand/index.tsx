import { cn } from '@pleadli/ui/lib/utils'
import { useSyncExternalStore } from 'react'

/** The institution's own logo. Ships with a default (the department's crest)
 * and an administrator may replace it with their own image, kept on this
 * computer as a data URL. Every place that shows the brand reads it here. */

export const DEFAULT_LOGO = '/brand/default-logo.svg'
const STORAGE_KEY = 'pleadli:prisons:logo'
/** Big enough for a crisp crest, small enough for local storage. */
export const MAX_LOGO_BYTES = 1024 * 1024

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
  try {
    if (dataUrl) localStorage.setItem(STORAGE_KEY, dataUrl)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    throw new Error('storage')
  }
  listeners.forEach((listener) => listener())
}

export function readLogoFile(file: File): Promise<string> {
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
