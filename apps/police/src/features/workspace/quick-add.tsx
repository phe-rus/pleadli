import { Createpanel } from '@/components/create-panel'
import { CaseForm } from '@/features/cases'
import { useNavigate } from '@tanstack/react-router'
import type { CreateFrameProps, QuickAddContext } from '@pleadli/shell'

/** The app's own drawer around a quick add form. */
export const CreateFrame = ({ open, onOpenChange, dirty, headings, children }: CreateFrameProps) => (
  <Createpanel open={open} onOpenChange={onOpenChange} isDirty={dirty} headings={headings}>
    {children}
  </Createpanel>
)

/** A new case opens its own workspace once it is saved. */
export function QuickCaseForm({ onDirtyChange, close }: QuickAddContext) {
  const navigate = useNavigate()
  return (
    <CaseForm
      onDirtyChange={onDirtyChange}
      onSuccess={(created) => {
        close()
        void navigate({ to: '/investigations/$caseId', params: { caseId: created.id } })
      }}
    />
  )
}
