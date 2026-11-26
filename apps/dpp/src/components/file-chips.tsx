import { cn } from '@pleadli/ui/lib/utils'
import * as m from '@/paraglide/messages'

/** The registry's own cover colour for a kind of file: the same chip on every
 * list (Today, Inbox, Files), so a file is recognised by it before it is read. */
const kindStyle: Record<string, string> = {
  perusal: 'bg-[#fbd9e3] text-[#8a1f47] dark:bg-[#8a1f47]/30 dark:text-[#fbd9e3]',
  application: 'bg-[#fbefb5] text-[#5e4900] dark:bg-[#5e4900]/40 dark:text-[#fbefb5]',
  appeal: 'bg-[#d6efdc] text-[#14532d] dark:bg-[#14532d]/40 dark:text-[#d6efdc]',
  revision: 'bg-[#d9e6fb] text-[#1d3f7a] dark:bg-[#1d3f7a]/40 dark:text-[#d9e6fb]',
  complaint: 'bg-[#e4e4e9] text-[#3a3a3f] dark:bg-white/10 dark:text-[#e4e4e9]',
}
export const kindBarColour: Record<string, string> = { perusal: '#f2a3bb', application: '#fbe08a', appeal: '#b9e0c3', revision: '#9fc0f2', complaint: '#d2d2d7' }

export const kindWord = (kind: string) =>
  (({ perusal: m["file.kind.perusal.label"], application: m["file.kind.application.label"], appeal: m["file.kind.appeal.label"], revision: m["file.kind.revision.label"], complaint: m["file.kind.complaint.label"] }) as Record<string, () => string>)[kind]?.() ?? kind

export function KindChip({ kind, label, className }: { kind: string; label?: string; className?: string }) {
  return <span className={cn('inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold', kindStyle[kind] ?? kindStyle.complaint, className)}>{label ?? kindWord(kind)}</span>
}

/** What is due, or when: orange when it needs doing today, grey otherwise. */
export function ClockChip({ urgent, children }: { urgent?: boolean; children: React.ReactNode }) {
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', urgent ? 'bg-[#fff1e6] text-[#9a3a00] dark:bg-[#9a3a00]/30 dark:text-[#ffd9b8]' : 'bg-[#f0f0f3] text-[#4a4a4f] dark:bg-white/10 dark:text-[#d2d2d7]')}>
      {children}
    </span>
  )
}
