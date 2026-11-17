import { Createpanel } from '@/components/create-panel'
import { ProsecutionFileForm } from '@/features/prosecution-files'
import { useNavigate } from '@tanstack/react-router'
import type { CreateFrameProps, QuickAddContext } from '@pleadli/shell'

/** The app's own drawer around a quick add form. */
export const CreateFrame = ({ open, onOpenChange, dirty, headings, children }: CreateFrameProps) => (
  <Createpanel open={open} onOpenChange={onOpenChange} isDirty={dirty} headings={headings}>
    {children}
  </Createpanel>
)

/** A new file opens its own workspace once it is saved. */
export function QuickFileForm({ onDirtyChange, close }: QuickAddContext) {
  const navigate = useNavigate()
  return (
    <ProsecutionFileForm
      onDirtyChange={onDirtyChange}
      onSuccess={(file) => {
        close()
        void navigate({ to: '/files/$fileId', params: { fileId: file.id } })
      }}
    />
  )
}
