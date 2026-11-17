import { cn } from '@pleadli/ui/lib/utils'
import { useState } from 'react'

export type PostboxLabels = {
  title: string
  /** One calm sentence: what the postbox is for. */
  intro: string
  outbox: { label: string; empty: string }
  inbox: { label: string; empty: string }
  /** Shown until the relay on pleadli.com is switched on for this office. */
  status: string
}

/** The postbox, empty on purpose. Packages for other offices will be sent and
 * collected through pleadli.com, so the app only shows an outbox and an inbox
 * and holds no relay code of its own. Props only, no router, no Tauri. */
export function PostboxView({ labels }: { labels: PostboxLabels }) {
  const [side, setSide] = useState<'outbox' | 'inbox'>('inbox')
  const sides = ['inbox', 'outbox'] as const
  return (
    <article className="page page-narrow">
      <header className="flex flex-col gap-1.5">
        <h1 className="tracking-tight">{labels.title}</h1>
        <p className="text-muted-foreground">{labels.intro}</p>
      </header>
      <div className="flex">
        <div role="tablist" className="flex rounded-[0.625rem] bg-foreground/[0.055] p-0.5">
          {sides.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={side === id}
              onClick={() => setSide(id)}
              className={cn(
                'min-w-24 cursor-pointer rounded-lg px-4 py-1 text-[0.8125rem] transition-colors duration-(--shell-motion-hover) motion-reduce:transition-none',
                side === id ? 'bg-background font-medium text-foreground shadow-sm ring-1 ring-black/5' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {labels[id].label}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="flex flex-col items-center gap-2 rounded-2xl bg-foreground/[0.03] px-6 py-16 text-center">
        <p className="max-w-sm text-muted-foreground">{labels[side].empty}</p>
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">{labels.status}</p>
    </article>
  )
}
