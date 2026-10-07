import * as m from '@/paraglide/messages'
import { getLocale, locales, setLocale, type Locale } from '@/paraglide/runtime'

const names: Record<Locale, string> = { en: 'English', sw: 'Kiswahili', fr: 'Français'}

/** The site in the visitor's language. The choice is kept in a cookie, so
 * the server renders every page in it from then on. */
export function LanguageSwitch({ className }: { className?: string }) {
  return (
    <select
      aria-label={m["nav.language"]()}
      value={getLocale()}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className={className ?? 'h-8 rounded-md border border-border/60 bg-background px-2 text-sm text-muted-foreground hover:text-foreground'}
    >
      {locales.map((l) => (
        <option key={l} value={l}>
          {names[l]}
        </option>
      ))}
    </select>
  )
}
