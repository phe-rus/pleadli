import { useEffect, useState } from 'react'

export type Branding = {
  institutionName?: string
  /** A hex color like #2563eb. `--primary-foreground` is picked for contrast,
   * not asked for separately — one color in, not a two-color form. */
  primaryColor?: string
}

const STORAGE_KEY = 'pleadli:branding'

function relativeLuminance(hex: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const int = parseInt(match[1], 16)
  const channel = (shift: number) => {
    const c = ((int >> shift) & 0xff) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
}

/**
 * Sets the brand-color CSS custom properties on the document, or clears them
 * back to the design system's own default when `color` is absent. Every
 * component that paints with `--color-primary` (buttons, badges, focus
 * rings, the sidebar...) picks this up with no per-component change, because
 * Tailwind's utilities resolve through the variable at paint time, not at
 * build time — this is the whole mechanism.
 *
 * Known simplification: this runs from a React effect, after first paint, so
 * there is a brief flash of the default color before a saved brand color
 * applies. Worth an inline pre-hydration script (like each app's dark-mode
 * one) if that flash turns out to matter in practice.
 */
export function applyBrandColor(color: string | undefined | null) {
  const root = document.documentElement
  if (!color) {
    for (const prop of ['--primary', '--primary-foreground', '--sidebar-primary', '--sidebar-primary-foreground', '--ring']) {
      root.style.removeProperty(prop)
    }
    return
  }
  const luminance = relativeLuminance(color)
  const foreground = luminance == null || luminance > 0.4 ? '#141414' : '#fafafa'
  root.style.setProperty('--primary', color)
  root.style.setProperty('--primary-foreground', foreground)
  root.style.setProperty('--sidebar-primary', color)
  root.style.setProperty('--sidebar-primary-foreground', foreground)
  root.style.setProperty('--ring', color)
}

function readStored(): Branding {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeStored(branding: Branding) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(branding))
  } catch {
    // Private browsing or disabled storage: branding just doesn't persist across reloads.
  }
}

/**
 * Institution branding for this installation: a display name and a brand
 * color applied over the design system's default tokens. Persisted on this
 * machine only — not synced across installations or institutions. Logo
 * upload and cross-machine/organization sync are a separate, larger piece,
 * not part of this mechanism yet.
 */
export function useBranding() {
  const [branding, setBrandingState] = useState<Branding>(() => (typeof window === 'undefined' ? {} : readStored()))

  useEffect(() => {
    applyBrandColor(branding.primaryColor)
  }, [branding.primaryColor])

  function setBranding(next: Branding) {
    setBrandingState(next)
    writeStored(next)
  }

  function resetBranding() {
    setBranding({})
  }

  return { branding, setBranding, resetBranding }
}
