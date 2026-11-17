import { useState } from 'react'
import * as m from '@/paraglide/messages'
import { getLocale, locales, setLocale, type Locale } from '@/paraglide/runtime'
import { Popover, PopoverContent, PopoverTrigger } from '@pleadli/ui/popover'
import { ArrowDown01Icon, LanguageSkillIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'

const names: Record<Locale, string> = { en: 'English', sw: 'Kiswahili', fr: 'Français' }

/** Uses the same locale cookie as server-rendered pages. */
export function LanguageSwitch({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const locale = getLocale()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={m['nav.language']()}
            className={cn(
              'flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm',
              'text-foreground/75 transition-colors hover:text-foreground',
              className,
            )}
          />
        }
      >
        <HugeiconsIcon icon={LanguageSkillIcon} className="size-4.5!" />
        <span className="hidden font-medium uppercase sm:inline">{locale}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className={cn('size-3.5! transition-transform', open && 'rotate-180')} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 gap-0.5 rounded-xl border-border/60 p-1.5 shadow-lg">
        {locales.map((language) => (
          <button
            key={language}
            type="button"
            aria-pressed={locale === language}
            onClick={() => { setOpen(false); setLocale(language) }}
            className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2',
              'text-left text-sm hover:bg-muted aria-pressed:font-medium',
            )}
          >
            {names[language]}
            {locale === language && <HugeiconsIcon icon={Tick02Icon} aria-hidden="true" className="size-4 text-primary-ink" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
