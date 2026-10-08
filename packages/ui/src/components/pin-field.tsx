import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '../lib/utils'
import { useEffect, useRef, type ComponentProps } from 'react'

/** Shakes an element side to side, as a Mac's login field does on a wrong
 * password. Uses the Web Animations API, so no stylesheet is needed. */
function useShake(ref: React.RefObject<HTMLElement | null>, trigger: unknown) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!trigger || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    ref.current?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }],
      { duration: 360, easing: 'ease-out' },
    )
  }, [trigger, ref])
}

/**
 * A PIN or a one-time code, the way an iPhone asks for one: a row of places
 * that fill as you type, so you always see how many digits you have given and
 * how many are left. `masked` draws dots (a PIN); without it each digit shows
 * in its own box (a code from a phone). A real input sits over the row, so the
 * keyboard, paste and a password manager all work, and `onComplete` fires the
 * moment the last digit goes in.
 */
export function PinField({
  value,
  onChange,
  onComplete,
  length = 6,
  masked = true,
  label,
  autoFocus,
  disabled,
  error,
  autoComplete,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  length?: number
  masked?: boolean
  /** Read by screen readers; the row itself has no visible label. */
  label: string
  autoFocus?: boolean
  disabled?: boolean
  /** Changes when an attempt fails: the row shakes. */
  error?: unknown
  autoComplete?: string
  className?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  useShake(row, error)
  const digits = value.split('')

  return (
    <div ref={row} className={cn('relative inline-flex', className)}>
      <div aria-hidden className={cn('flex items-center', masked ? 'gap-3.5' : 'gap-2')}>
        {Array.from({ length }, (_, i) => {
          const filled = i < digits.length
          const current = i === digits.length
          return masked ? (
            <span key={i} className={cn('size-3.5 rounded-full border-[1.5px] transition-colors duration-100', filled ? 'border-foreground bg-foreground' : 'border-foreground/35 bg-transparent')} />
          ) : (
            <span
              key={i}
              className={cn(
                'flex h-12 w-10 items-center justify-center rounded-lg bg-card text-xl font-medium tabular-nums ring-1 transition-shadow',
                current ? 'ring-2 ring-primary' : 'ring-border',
                // A gap after the third box, as a code from a phone is read.
                length === 6 && i === 2 && 'me-2',
              )}
            >
              {digits[i] ?? ''}
            </span>
          )
        })}
      </div>
      <input
        aria-label={label}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        autoComplete={autoComplete ?? (masked ? 'current-password' : 'one-time-code')}
        // Masked: a password field to the browser, so it is never shown or remembered as text.
        type={masked ? 'password' : 'text'}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, '').slice(0, length)
          onChange(next)
          if (next.length === length) onComplete?.(next)
        }}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
    </div>
  )
}

/**
 * A password, as a Mac's login window asks for one: one rounded field with
 * the arrow that submits it inside, on the right. Put it in a `<form>`.
 */
export function PasswordField({ busy, error, className, ...input }: Omit<ComponentProps<'input'>, 'type'> & { busy?: boolean; error?: unknown }) {
  const box = useRef<HTMLDivElement>(null)
  useShake(box, error)
  const empty = !input.value
  return (
    <div ref={box} className={cn(signInFieldClass, className)}>
      <input type="password" className={signInInputClass} {...input} />
      <SignInArrow hidden={empty} disabled={empty || busy || input.disabled} label={typeof input.placeholder === 'string' ? input.placeholder : undefined} />
    </div>
  )
}

/** The look of a sign-in field (badge, user name, password): one calm
 * rounded box with a hairline, a 1px accent when focused, no glow. */
export const signInFieldClass =
  'flex h-11 w-full items-center gap-2 rounded-xl bg-card ps-3.5 pe-1.5 ring-1 ring-border shadow-xs transition-[box-shadow,color] focus-within:ring-primary'
export const signInInputClass = 'h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground'

/** The arrow inside a sign-in field: there once something is typed, as on a Mac. */
export function SignInArrow({ hidden, disabled, label }: { hidden?: boolean; disabled?: boolean; label?: string }) {
  return (
    <button
      type="submit"
      aria-label={label}
      disabled={disabled}
      tabIndex={hidden ? -1 : undefined}
      className={cn(
        'flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity duration-150 disabled:cursor-default',
        hidden ? 'pointer-events-none opacity-0' : 'disabled:opacity-50',
      )}
    >
      <HugeiconsIcon icon={ArrowRight02Icon} className="size-4" />
    </button>
  )
}
