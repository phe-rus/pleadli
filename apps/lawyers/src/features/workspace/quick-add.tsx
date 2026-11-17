import { Createpanel } from '@/components/create-panel'
import { MatterForm } from '@/features/matters'
import { useNavigate } from '@tanstack/react-router'
import type { CreateFrameProps, QuickAddContext } from '@pleadli/shell'

/** The app's own drawer around a quick add form. */
export const CreateFrame = ({ open, onOpenChange, dirty, headings, children }: CreateFrameProps) => (
  <Createpanel open={open} onOpenChange={onOpenChange} isDirty={dirty} headings={headings}>
    {children}
  </Createpanel>
)

/** A new matter opens its own workspace once it is saved. */
export function QuickMatterForm({ onDirtyChange, close }: QuickAddContext) {
  const navigate = useNavigate()
  return (
    <MatterForm
      onDirtyChange={onDirtyChange}
      onSuccess={(matter) => {
        close()
        void navigate({ to: '/matters/$matterId', params: { matterId: matter.id } })
      }}
    />
  )
}
