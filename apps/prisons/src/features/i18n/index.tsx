import { baseLocale, getLocale, isLocale, locales, setLocale, type Locale } from '@/paraglide/runtime'
import { facilityProfileOptions } from '@/features/facility'
import { usePermissions } from '@/features/session'
import { useQuery } from '@tanstack/react-query'
import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from 'react'

export { baseLocale, locales, type Locale }

/** Which locales an installation may choose today. The catalogs for the rest
 * exist and fall back to English key by key, but the node refuses a language
 * it has no complete translation for (`facility_profile::LANGUAGES`). */
export const selectableLocales: readonly Locale[] = ['en', 'sw', 'de']

export const localeNames: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
  fr: 'Français',
  de: 'Deutsch',
  zh: '中文',
}

const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** Changes the language without a reload and tells every subscriber. Paraglide
 * messages are plain functions, so React only shows the new words once
 * `LocaleBoundary` remounts what is below it. */
export function changeLocale(next: string | null | undefined) {
  if (!next || !isLocale(next) || next === getLocale()) return
  void setLocale(next, { reload: false })
  document.documentElement.lang = next
  listeners.forEach((listener) => listener())
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => baseLocale)
}

/** Remounts its children when the language changes. Rare and deliberate, so
 * losing transient screen state is the right trade against threading a
 * context through every string. */
export function LocaleBoundary({ children }: { children: ReactNode }) {
  const locale = useLocale()
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return <Fragment key={locale}>{children}</Fragment>
}

/** The installation's language is stored on the node, so every officer on it
 * sees the same words. Sign-in screens, before the node can be asked, use the
 * one this computer last showed (Paraglide keeps it in local storage). */
export function useLocaleFromProfile() {
  const { can, session } = usePermissions()
  const { data: profile } = useQuery({ ...facilityProfileOptions(), retry: false, enabled: !!session && (can('prisoner.read') || can('node.manage')) })
  useEffect(() => changeLocale(profile?.language), [profile?.language])
}
export { LanguageSelect } from './language-select'

/** A label used mid-sentence. English and Kiswahili lower-case it; German
 * keeps the capital, because its nouns are always capitalised. Display only. */
export function inlineLabel(label: string) {
  return getLocale() === 'de' ? label : label.toLowerCase()
}
