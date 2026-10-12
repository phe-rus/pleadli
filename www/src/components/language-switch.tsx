import { useState } from 'react'
import * as m from '@/paraglide/messages'
import { getLocale, locales, setLocale, type Locale } from '@/paraglide/runtime'
import { Popover, PopoverContent, PopoverTrigger } from '@pleadli/ui/popover'
import { LanguageSkillIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

const names: Record<Locale, string> = { en: 'English', sw: 'Kiswahili', fr: 'Français' }

/** Uses the same locale cookie as server-rendered pages. */
export function LanguageSwitch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const locale = getLocale()
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger render={<button type="button" aria-label={m['nav.language']()} className={className ?? 'flex h-9 items-center gap-2 rounded-full px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'} />}>
      <HugeiconsIcon icon={LanguageSkillIcon} className="size-4!" />
      <span>{names[locale]}</span><span aria-hidden="true" className="text-[10px] opacity-60">⌄</span>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-48 gap-1 rounded-2xl border-border/50 p-2 shadow-xl">
      <span className="px-3 py-2 text-xs text-muted-foreground">{m['nav.language']()}</span>
      {locales.map(language => <button key={language} type="button" aria-pressed={locale === language} onClick={() => { setOpen(false); setLocale(language) }} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted aria-pressed:bg-muted aria-pressed:font-medium">
        {names[language]}{locale === language && <span aria-hidden="true">✓</span>}
      </button>)}
    </PopoverContent>
  </Popover>
}
