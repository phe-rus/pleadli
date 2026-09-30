import { ArrowDown01Icon, Globe02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { AnimatePresence, motion, useDragControls, useMotionValue, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import * as m from '@/paraglide/messages'
import { changeLocale, localeNames, selectableLocales, useLocale } from './index'

/** Floating, draggable language switcher, ported from transspace. Mounted at
 * the root so it is there from the first screen: setup, sign-in and the
 * workspace alike, and the PIN lock screen. Its resting corner is remembered on this computer. */

type Anchor = { side: 'left' | 'right'; edge: 'top' | 'bottom'; x: number; y: number }
const STORAGE_KEY = 'pleadli:lawyers:language-select'
const DEFAULT_ANCHOR: Anchor = { side: 'right', edge: 'bottom', x: 20, y: 20 }
const PADDING = 12
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

function readAnchor(): Anchor | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Anchor> | null
    if (parsed && (parsed.side === 'left' || parsed.side === 'right') && (parsed.edge === 'top' || parsed.edge === 'bottom') && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return parsed as Anchor
    }
  } catch {}
  return null
}

function writeAnchor(anchor: Anchor) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(anchor))
  } catch {}
}

function toAnchor(rect: DOMRect): Anchor {
  const left = clamp(rect.left, PADDING, Math.max(PADDING, window.innerWidth - rect.width - PADDING))
  const top = clamp(rect.top, PADDING, Math.max(PADDING, window.innerHeight - rect.height - PADDING))
  const side = left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right'
  const edge = top + rect.height / 2 < window.innerHeight / 2 ? 'top' : 'bottom'
  return {
    side,
    edge,
    x: side === 'left' ? left : window.innerWidth - left - rect.width,
    y: edge === 'top' ? top : window.innerHeight - top - rect.height,
  }
}

export function LanguageSelect() {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const didDrag = useRef(false)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<Anchor>(() => readAnchor() ?? DEFAULT_ANCHOR)
  const reduceMotion = useReducedMotion()
  const current = useLocale()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function commitDrag() {
    const el = containerRef.current
    if (!el) return
    const next = toAnchor(el.getBoundingClientRect())
    setAnchor(next)
    writeAnchor(next)
    x.set(0)
    y.set(0)
  }

  const growsUp = anchor.edge === 'bottom'

  return (
    <motion.div
      ref={containerRef}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      style={{
        position: 'fixed',
        x,
        y,
        ...(anchor.side === 'left' ? { left: anchor.x } : { right: anchor.x }),
        ...(anchor.edge === 'top' ? { top: anchor.y } : { bottom: anchor.y }),
      }}
      onDragStart={() => (didDrag.current = false)}
      onDrag={() => (didDrag.current = true)}
      onDragEnd={commitDrag}
      className="z-50 print:hidden"
    >
      <motion.div
        layout
        transition={{ type: 'spring', damping: 26, stiffness: 360, mass: 0.7 }}
        className={cn(
          'flex overflow-hidden',
          growsUp ? 'flex-col-reverse' : 'flex-col',
          open && 'rounded-xl border border-border bg-background shadow-md',
        )}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label={m["i18n.language_aria"]({ name: localeNames[current] })}
          aria-haspopup="listbox"
          aria-expanded={open}
          title={localeNames[current]}
          onPointerDown={(e) => dragControls.start(e)}
          onClick={() => {
            if (didDrag.current) {
              didDrag.current = false
              return
            }
            setOpen((prev) => !prev)
          }}
          className="ml-auto h-9 w-fit gap-1.5 rounded-full px-3"
        >
          <HugeiconsIcon icon={Globe02Icon} className="shrink-0" />
          <span>{current.toUpperCase()}</span>
          <motion.span animate={{ rotate: open ? 180 : 0 }} className="shrink-0">
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
          </motion.span>
        </Button>

        <AnimatePresence>
          {open && (
            <motion.div
              key="panel"
              role="listbox"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: growsUp ? 6 : -6 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn('flex w-48 flex-col gap-0.5 p-1', growsUp ? 'mb-1' : 'mt-1')}
            >
              {selectableLocales.map((locale) => {
                const active = locale === current
                return (
                  <button
                    key={locale}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setOpen(false)
                      changeLocale(locale)
                    }}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left',
                      active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="uppercase">{locale}</span>
                      <span className="truncate">{localeNames[locale]}</span>
                    </span>
                    {active && <HugeiconsIcon icon={Tick02Icon} className="size-4" />}
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
