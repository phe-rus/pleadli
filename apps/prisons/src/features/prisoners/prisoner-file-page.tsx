import { Createpanel } from '@/components/create-panel'
import { EditPrisonerForm } from './edit-prisoner-form'
import { usePrisoner } from './queries'
import { CareTab } from './profile/care-tab'
import { HistoryTab } from './profile/history-tab'
import { LegalTab } from './profile/legal-tab'
import { PrisonerDocument } from './profile/prisoner-document'
import { PropertyTab } from './profile/property-tab'
import { DropdownMenuItem } from '@pleadli/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

export const prisonerTabIds = ['overview', 'legal', 'care', 'property', 'history'] as const
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

  const current: PrisonerTab = tab ?? 'overview'
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
            <Tabs value={current} onValueChange={(value) => setTab(String(value))}>
              <TabsList aria-label={m.paper_prisoner_record()} className="h-auto! min-h-10 max-w-full justify-start! overflow-x-auto rounded-xl bg-foreground/[0.045] p-1 [&>[data-slot=tabs-trigger]]:shrink-0 [&>[data-slot=tabs-trigger]]:rounded-lg [&>[data-slot=tabs-trigger]]:px-3 [&>[data-slot=tabs-trigger]]:py-1.5 [&>[data-slot=tabs-trigger]]:data-active:shadow-xs">
                <TabsTrigger value="overview">{m.workspace_overview()}</TabsTrigger>
                <TabsTrigger value="legal">{m.route_prisoners_legal()}</TabsTrigger>
                <TabsTrigger value="care">{m.route_prisoners_care_and_contact()}</TabsTrigger>
                <TabsTrigger value="property">{m.route_prisoners_property_and_documents()}</TabsTrigger>
                <TabsTrigger value="history">{m.route_prisoners_history()}</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="pt-4">{overview}</TabsContent>
              <TabsContent value="legal" className="pt-4">
                <LegalTab prisonerId={prisonerId} />
              </TabsContent>
              <TabsContent value="care" className="pt-4">
                <CareTab prisonerId={prisonerId} />
              </TabsContent>
              <TabsContent value="property" className="pt-4">
                <PropertyTab prisonerId={prisonerId} />
              </TabsContent>
              <TabsContent value="history" className="pt-4">
                <HistoryTab prisonerId={prisonerId} />
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}
    </PrisonerDocument>
  )
}
