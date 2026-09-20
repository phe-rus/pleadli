import { cn } from '@pleadli/ui/lib/utils'
import { authModeCopy, authModes, type AuthMode } from './schema'
import { m } from '@/paraglide/messages'

/** The three ways a facility can have its officers sign in, as one choice.
 * Shared by first setup and Settings so the wording never drifts. */
export function AuthModeChoice({ value, onChange, disabled = false }: { value: AuthMode; onChange: (mode: AuthMode) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={m.auth_policy_how_officers_sign_in()} className="flex flex-col gap-2">
      {authModes.map((mode) => {
        const selected = value === mode
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3.5 py-3 text-left transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
              selected ? 'border-primary/60 bg-primary/5' : 'border-border bg-card hover:border-primary/30',
            )}
          >
            <span className="flex items-center gap-2">
              <span className={cn('flex size-3.5 items-center justify-center rounded-full border', selected ? 'border-primary' : 'border-muted-foreground/50')}>
                {selected && <span className="size-2 rounded-full bg-primary" />}
              </span>
              {authModeCopy[mode].title}
            </span>
            <span className="pl-5.5 text-muted-foreground">{authModeCopy[mode].description}</span>
          </button>
        )
      })}
    </div>
  )
}
