import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@pleadli/ui/accordion'
import { cn } from '@pleadli/ui/lib/utils'
import type { ReactNode } from 'react'

export interface FaqItem {
  id: string
  title: string
  body: ReactNode
}

/** Collapsible rows built on the UI package's accordion (keyboard and screen reader
 * behaviour included), at reading size. Replaces the browser's native disclosure tags. */
export function FaqList({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <Accordion className={cn('rounded-2xl border-border/60 bg-card', className)}>
      {items.map((item) => (
        <AccordionItem key={item.id} value={item.id} className="border-border/60 data-open:bg-transparent">
          <AccordionTrigger className="px-5 py-4 text-base! font-medium hover:no-underline">{item.title}</AccordionTrigger>
          <AccordionContent className="px-3 text-base! leading-relaxed text-muted-foreground">{item.body}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
