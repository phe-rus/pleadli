import { baseLocale, getLocale, isLocale, locales, setLocale, type Locale } from '@/paraglide/runtime'
import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from 'react'

export { baseLocale, locales, type Locale }

/** Every language the app ships, fully translated. Not yet reviewed by a
 * native-speaking lawyer; missing keys fall back to English key by key,
 * never to a raw key. */
export const selectableLocales: readonly Locale[] = ['en', 'sw', 'de', 'fr']

/** Endonyms: each language named in itself. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
  de: 'Deutsch',
  fr: 'Français',
}

// The page states its language before the first render, so anything reading
// `<html lang>` (the shared tables, the browser's own spelling and hyphenation)
// is right from the first paint.
if (typeof document !== 'undefined') document.documentElement.lang = getLocale()

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
export { LanguageSelect, StatusBarLanguageSelect } from './language-select'
