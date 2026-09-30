import { baseLocale, getLocale, isLocale, locales, setLocale, type Locale } from '@/paraglide/runtime'
import { Fragment, useEffect, useSyncExternalStore, type ReactNode } from 'react'

export { baseLocale, locales, type Locale }

/** Which locales this installation may choose today. Missing keys fall back to
 * English key by key, never to a raw key. */
export const selectableLocales: readonly Locale[] = ['en', 'sw', 'de', 'fr']

/** Each language names itself, so these are not translated. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  sw: 'Kiswahili',
  de: 'Deutsch',
  fr: 'Français',
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
export { LanguageSelect } from './language-select'
