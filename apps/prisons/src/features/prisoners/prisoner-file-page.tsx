import { Createpanel } from '@/components/create-panel'
import { EditPrisonerForm } from './edit-prisoner-form'
import { usePrisoner } from './queries'
import { CareTab } from './profile/care-tab'
import { HistoryTab } from './profile/history-tab'
import { LegalTab } from './profile/legal-tab'
import { PrisonerDocument } from './profile/prisoner-document'
import { PropertyTab } from './profile/property-tab'
import { DropdownMenuItem } from '@pleadli/ui/dropdown-menu'
import { RecordTabsView } from '@pleadli/shell'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

export const prisonerTabIds = ['overview', 'papers', 'people', 'history', 'legal', 'care', 'property'] as const
export type PrisonerTab = (typeof prisonerTabIds)[number]

/**
 * The prisoner file read as a document (docs/prisons/product-map/08 1.4): the
 * identity and where they are in the legal machine up front, then the depth
 * (legal, care, property, history) as tabs below the spine.
 */
export function PrisonerFilePage({ prisonerId, tab, onTabChange }: { prisonerId: string; tab?: PrisonerTab; onTabChange: (tab: PrisonerTab) => void }) {
  const { data: prisoner } = usePrisoner(prisonerId)
  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)

  if (!prisoner) {
    return (
      <article className="page">
        <p className="text-sm text-muted-foreground">{m.route_prisoners_this_prisoner_could_not_be_found()}</p>
      </article>
    )
  }

  // Links from before the shared frame still say care and property.
  const current: PrisonerTab = tab === 'care' ? 'people' : tab === 'property' ? 'papers' : (tab ?? 'overview')
  const setTab = (value: string) => onTabChange(value as PrisonerTab)

  return (
    <PrisonerDocument
      prisonerId={prisonerId}
      onOpenTab={setTab}
      actions={<DropdownMenuItem onClick={() => setEditOpen(true)}>{m.route_prisoners_edit_details()}</DropdownMenuItem>}
    >
      {(overview) => (
        <>
          <Createpanel
            open={editOpen}
            onOpenChange={setEditOpen}
            isDirty={editDirty}
            headings={{ title: m.route_prisoners_edit_prisoner_details(), description: m.route_prisoners_update_identity_category_and_notes() }}
          >
            <EditPrisonerForm prisoner={prisoner} onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
          </Createpanel>
          <div className="border-t border-border/60 pt-4">
            <RecordTabsView
              labels={{
                overview: { label: m.workspace_overview(), empty: '', action: '' },
                papers: { label: m.route_prisoners_property_and_documents(), empty: '', action: '' },
                people: { label: m.route_prisoners_care_and_contact(), empty: '', action: '' },
                history: { label: m.route_prisoners_history(), empty: '', action: '' },
              }}
              value={current}
              onValueChange={setTab}
              extra={[{ id: 'legal', label: m.route_prisoners_legal(), content: <LegalTab prisonerId={prisonerId} /> }]}
              content={{
                overview,
                papers: <PropertyTab prisonerId={prisonerId} />,
                people: <CareTab prisonerId={prisonerId} />,
                history: <HistoryTab prisonerId={prisonerId} />,
              }}
            />
          </div>
        </>
      )}
    </PrisonerDocument>
  )
}
