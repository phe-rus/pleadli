import { ArrowLeft01Icon, ArrowRight01Icon, Folder01Icon, Logout03Icon, Search01Icon, Settings01Icon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarToggle } from '@pleadli/shell/view'
import { cn } from '@pleadli/ui/lib/utils'
import { WindowControls } from '@pleadli/ui/window-controls'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

type Icon = typeof Folder01Icon
export interface ShellRow { icon: Icon; label: string; count?: number; urgent?: boolean }
export interface ShellSection { label?: string; rows: ShellRow[] }
export interface ShellScreen { row: string; tab: { icon: Icon; label: string }; content: ReactNode }

const STEP_MS = 3600

const noop = () => {}
const controlLabels = { group: 'Window', close: 'Close', minimize: 'Minimize', maximize: 'Maximize' }

/** The same window buttons the apps use, drawn for show: nothing in them can be pressed or focused. */
function Lights() {
  return (
    <div inert aria-hidden="true" className="pointer-events-none">
      <WindowControls focused labels={controlLabels} onClose={noop} onMinimize={noop} onToggleMaximize={noop} />
    </div>
  )
}

function Row({ icon, label, active, count, urgent, onOpen }: ShellRow & { active: boolean; onOpen?: () => void }) {
  return (
    <div onClick={onOpen} className={cn("relative flex h-7.5 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[0.8125rem] transition-colors", onOpen ? "cursor-pointer hover:bg-foreground/[0.05]" : "cursor-default")}>
      <motion.span className="absolute inset-0 rounded-lg bg-primary/12" initial={false} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.28 }} />
      <HugeiconsIcon icon={icon} className={cn('relative size-4 shrink-0 transition-colors duration-300', active ? 'text-primary' : 'text-muted-foreground')} />
      <span className={cn('relative min-w-0 flex-1 truncate', active ? 'font-medium text-foreground' : 'text-sidebar-foreground')}>{label}</span>
      {!!count && <span className={cn('relative shrink-0 text-xs tabular-nums', urgent ? 'rounded-full bg-destructive px-1.5 leading-4 font-semibold text-white' : 'text-muted-foreground')}>{count}</span>}
    </div>
  )
}

/** The shell every Pleadli desktop app shares, drawn from the same markup, and it
 * navigates by itself: the sidebar highlight moves, a tab opens, the page changes. */
export function AppShell({ product, office, crest, sections, screens, user, banner }: {
  product: string; office: string; crest: string; sections: ShellSection[]; screens: ShellScreen[]
  user: { initials: string; name: string; sub: string }; banner?: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [opened, setOpened] = useState<number[]>([0])
  const [touched, setTouched] = useState(false)
  const go = (i: number, byUser = false) => {
    if (byUser) setTouched(true)
    setStep(i)
    setOpened((o) => (o.includes(i) ? o : [...o, i]))
  }
  const close = (i: number) => {
    setTouched(true)
    const rest = opened.filter((n) => n !== i)
    setOpened(rest)
    if (step === i) setStep(rest[rest.length - 1] ?? 0)
  }
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible || reduced || touched || screens.length < 2) return
    const timer = window.setInterval(() => {
      setStep((s) => {
        const n = (s + 1) % screens.length
        setOpened(n === 0 ? [0] : (o) => (o.includes(n) ? o : [...o, n]))
        return n
      })
    }, STEP_MS)
    return () => window.clearInterval(timer)
  }, [visible, reduced, touched, screens.length])
  const current = screens[step]
  const tabs = opened.map((i) => ({ i, tab: screens[i].tab }))
  const indexOfRow = (label: string) => screens.findIndex((sc) => sc.row === label)

  return (
    <div ref={root} className="flex h-full w-full overflow-hidden bg-background text-[16px]">
      <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar">
        <header className="flex h-12 w-full shrink-0 items-center overflow-hidden">
          <div className="flex w-full shrink-0 items-center gap-3 ps-4 pe-2">
            <Lights />
            <span className="flex-1" />
            <SidebarToggle open label="Sidebar" onToggle={() => {}} className="pointer-events-none" />
          </div>
        </header>
        <div className="flex shrink-0 items-center gap-2.5 px-4 pt-1 pb-3">
          <img src={crest} alt="" className="size-8 shrink-0 object-contain" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[0.8125rem] leading-4 font-semibold">{product}</span>
            <span className="truncate text-[0.6875rem] leading-4 text-muted-foreground">{office}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 px-2 pt-1 pb-1">
          <div className="flex h-7.5 min-w-0 flex-1 items-center gap-2 rounded-lg bg-foreground/[0.045] px-2.5 text-[0.8125rem] text-muted-foreground">
            <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0" />
            <span className="flex-1 truncate text-left">Search</span>
            <kbd className="font-sans text-[0.6875rem] text-muted-foreground/70">Ctrl K</kbd>
          </div>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md text-lg text-muted-foreground">+</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-3">
          {sections.map((section, i) => (
            <section key={i} className={cn('flex flex-col', i === 0 ? 'pt-2' : 'pt-3')}>
              {section.label && <div className="flex h-6 w-full items-center px-2.5 text-[0.6875rem] font-semibold text-muted-foreground/80">{section.label}</div>}
              <div className="flex flex-col gap-px pt-0.5">{section.rows.map((r) => <Row key={r.label} {...r} active={r.label === current.row} onOpen={indexOfRow(r.label) >= 0 ? () => go(indexOfRow(r.label), true) : undefined} />)}</div>
            </section>
          ))}
        </div>
        <div className="flex items-center gap-1 px-2 py-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-primary/80 to-primary text-[0.6875rem] font-semibold text-primary-foreground">{user.initials}</span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[0.8125rem] font-medium text-foreground">{user.name}</span>
              <span className="truncate text-[0.6875rem] text-muted-foreground">{user.sub}</span>
            </span>
          </div>
          <span className="text-xs text-muted-foreground">EN</span>
          <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground"><HugeiconsIcon icon={Settings01Icon} className="size-4" /></span>
          <span className="flex size-7 shrink-0 items-center justify-center text-muted-foreground"><HugeiconsIcon icon={Logout03Icon} className="size-4" /></span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex h-12 shrink-0 items-center gap-1 bg-background/80">
          <div className="flex min-w-0 flex-1 items-center gap-1 self-stretch overflow-hidden px-2">
            <AnimatePresence initial={false}>
              {tabs.map(({ i, tab }) => {
                const active = i === step
                return (
                  <motion.div
                    key={tab.label}
                    onClick={() => go(i, true)}
                    initial={{ opacity: 0, x: -10, scale: 0.94 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className={cn('relative flex h-7.5 min-w-24 cursor-pointer items-center gap-1 rounded-lg pr-1 pl-2.5 text-[0.8125rem] whitespace-nowrap', i === 0 ? 'flex-none' : 'flex-[0_1_13rem]')}
                  >
                    <motion.span className="absolute inset-0 rounded-lg bg-background shadow-xs ring-1 ring-black/[0.06]" initial={false} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.28 }} />
                    <span className={cn('relative flex min-w-0 flex-1 items-center gap-1.5 py-1', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                      <HugeiconsIcon icon={tab.icon} className="size-3.5 shrink-0 opacity-70" />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    {i > 0 && active && <span onClick={(e) => { e.stopPropagation(); close(i) }} className="relative flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground opacity-70 hover:bg-foreground/10"><HugeiconsIcon icon={XIcon} className="size-3.5" /></span>}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
          <nav className="relative z-10 flex shrink-0 items-center gap-1 pr-2 pl-1">
            <span className="shell-capsule">
              <span onClick={() => { const p = opened.indexOf(step); if (p > 0) go(opened[p - 1], true) }} className={cn('flex size-8 items-center justify-center', opened.indexOf(step) > 0 ? 'cursor-pointer text-foreground' : 'text-muted-foreground/50')}><HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" /></span>
              <span className="flex size-8 items-center justify-center text-muted-foreground/50"><HugeiconsIcon icon={ArrowRight01Icon} className="size-4" /></span>
            </span>
          </nav>
        </header>
        {banner}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.row}
              className="min-h-0 flex-1 overflow-hidden"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              {current.content}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
