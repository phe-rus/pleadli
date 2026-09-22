import { Createpanel } from '@/components/create-panel'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { useState, type ReactNode } from 'react'

/** A button that opens a side panel holding one form. Owns the open and dirty
 * state every panel needs, so a page lists its actions instead of repeating
 * that state. The form calls `close` on success and `setDirty` as it changes. */
export function PanelButton({
  label,
  title,
  description,
  variant = 'secondary',
  icon = true,
  children,
}: {
  label: string
  title: string
  description: string
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'
  icon?: boolean
  children: (panel: { close: () => void; setDirty: (dirty: boolean) => void }) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const close = () => {
    setOpen(false)
    setDirty(false)
  }

  return (
    <Createpanel
      open={open}
      onOpenChange={setOpen}
      isDirty={dirty}
      trigger={
        <Button size="sm" variant={variant}>
          {icon && <HugeiconsIcon icon={AddCircleIcon} />}
          {label}
        </Button>
      }
      headings={{ title, description }}
    >
      {children({ close, setDirty })}
    </Createpanel>
  )
}
