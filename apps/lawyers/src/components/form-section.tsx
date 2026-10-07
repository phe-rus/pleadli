import { FieldLegend, FieldSet } from '@pleadli/ui/field'
import type { ReactNode } from 'react'

/** A group of fields in a side-panel form, under a short title. Sections after
 * the first are set off by a rule, so a long form reads as a few small ones. */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FieldSet className="m-0 min-w-0 border-0 p-0 [&+&]:border-t [&+&]:border-border/70 [&+&]:pt-5">
      <FieldLegend className="mb-1 text-muted-foreground">{title}</FieldLegend>
      {children}
    </FieldSet>
  )
}
