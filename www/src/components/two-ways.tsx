import { cn } from '@pleadli/ui/lib/utils'
import {
  File01Icon,
  FileExportIcon,
  PrinterIcon,
  ScanIcon,
  Mailbox01Icon,
  LockKeyIcon,
  CheckmarkBadge01Icon,
  Building02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Reveal } from '@/components/reveal'
import * as m from '@/paraglide/messages'

const wrap = 'container w-full md:max-w-6xl'

function Column({ title, lead, items, note, tone }: { title: string; lead: string; items: { icon: typeof File01Icon; text: string }[]; note: string; tone: 'paper' | 'post' }) {
  return (
    <div className={cn('flex flex-col gap-5 rounded-2xl border border-border p-6 md:p-8', tone === 'post' ? 'bg-background' : 'bg-background')}>
      <div className="flex flex-col gap-2">
        <h3 className="text-2xl! font-bold tracking-tight">{title}</h3>
        <p className="text-base! leading-relaxed text-muted-foreground">{lead}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((item) => (
          <li key={item.text} className="flex items-start gap-3 text-base">
            <HugeiconsIcon icon={item.icon} className="mt-0.5 size-5! shrink-0 text-primary-ink" />
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <p className={cn('m-0 mt-auto w-fit rounded-full px-3 py-1 text-xs font-medium', tone === 'post' ? 'bg-amber-500/15 text-amber-900 dark:text-amber-200' : 'bg-primary/10 text-primary-ink')}>{note}</p>
    </div>
  )
}

/** The old way and the new way for the same paper. The postbox is labelled as not yet in use. */
export function TwoWays() {
  return (
    <section className="border-t border-border/60 bg-muted/60" aria-labelledby="twoways-title">
      <div className={cn(wrap, 'flex flex-col gap-10 py-16 md:py-28')}>
        <Reveal className="flex max-w-3xl flex-col items-start gap-4">
          <h2 id="twoways-title" className="text-3xl! font-bold leading-tight! tracking-tight md:text-5xl!">{m['twoways.title']()}</h2>
          <p className="text-lg! leading-relaxed text-muted-foreground">{m['twoways.lead']()}</p>
        </Reveal>
        <Reveal className="grid gap-6 md:grid-cols-2">
          <Column
            tone="paper"
            title={m['twoways.paper_title']()}
            lead={m['twoways.paper_lead']()}
            note={m['twoways.offline']()}
            items={[
              { icon: PrinterIcon, text: m['twoways.paper_1']() },
              { icon: File01Icon, text: m['twoways.paper_2']() },
              { icon: FileExportIcon, text: m['twoways.paper_3']() },
              { icon: ScanIcon, text: m['twoways.paper_4']() },
            ]}
          />
          <Column
            tone="post"
            title={m['twoways.post_title']()}
            lead={m['twoways.post_lead']()}
            note={m['twoways.status']()}
            items={[
              { icon: Mailbox01Icon, text: m['twoways.post_1']() },
              { icon: LockKeyIcon, text: m['twoways.post_2']() },
              { icon: CheckmarkBadge01Icon, text: m['twoways.post_3']() },
              { icon: Building02Icon, text: m['twoways.post_4']() },
            ]}
          />
        </Reveal>
      </div>
    </section>
  )
}
