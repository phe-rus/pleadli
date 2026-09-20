import { Createpanel } from '@/components/create-panel'
import { courtProductionsForPrisonerOptions } from '@/features/court-productions'
import { prisonerFileOptions } from '@/features/custody'
import { healthEventsForPrisonerOptions } from '@/features/health-events'
import { EditPrisonerForm, prisonerOptions, usePrisoner } from '@/features/prisoners'
import { CareTab } from '@/features/prisoners/profile/care-tab'
import { HistoryTab } from '@/features/prisoners/profile/history-tab'
import { LegalTab } from '@/features/prisoners/profile/legal-tab'
import { PrisonerDocument } from '@/features/prisoners/profile/prisoner-document'
import { PropertyTab } from '@/features/prisoners/profile/property-tab'
import { programmeParticipationsForPrisonerOptions } from '@/features/programme-participations'
import { propertyRecordsForPrisonerOptions } from '@/features/property-records'
import { releasesForPrisonerOptions } from '@/features/releases'
import { requestsForPrisonerOptions } from '@/features/requests'
import { transfersForPrisonerOptions } from '@/features/transfers'
import { visitsForPrisonerOptions } from '@/features/visits'
import { Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

const tabIds = ['legal', 'care', 'property', 'history'] as const
type TabId = (typeof tabIds)[number]

export const Route = createFileRoute('/_public/prisoners/$prisonerId')({
  validateSearch: (search: Record<string, unknown>): { tab?: TabId } =>
    typeof search.tab === 'string' && (tabIds as readonly string[]).includes(search.tab) ? { tab: search.tab as TabId } : {},
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...prisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...prisonerFileOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...courtProductionsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...releasesForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...visitsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...healthEventsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...transfersForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...programmeParticipationsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...propertyRecordsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
      context.queryClient.query({ ...requestsForPrisonerOptions(params.prisonerId), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/**
 * The prisoner file read as a document (docs/prisons/product-map/08 1.4): the
 * identity and where they are in the legal machine up front, then the depth
 * (legal, care, property, history) as tabs below the spine.
 */
function RouteComponent() {
  const { prisonerId } = Route.useParams()
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { data: prisoner } = usePrisoner(prisonerId)
  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)

  if (!prisoner) {
    return (
      <article className="page">
        <p className="text-sm text-muted-foreground">This prisoner could not be found.</p>
      </article>
    )
  }

  const current: TabId = tab ?? 'legal'
  const setTab = (value: string) => navigate({ search: { tab: value as TabId }, replace: true })

  return (
    <PrisonerDocument
      prisonerId={prisonerId}
      onOpenTab={setTab}
      actions={
        <Createpanel
          open={editOpen}
          onOpenChange={setEditOpen}
          isDirty={editDirty}
          trigger={
            <Button size="sm" variant="ghost">
              <HugeiconsIcon icon={Edit02Icon} />
              Edit details
            </Button>
          }
          headings={{ title: 'Edit prisoner details', description: 'Update identity, category, and notes.' }}
        >
          <EditPrisonerForm prisoner={prisoner} onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
        </Createpanel>
      }
    >
      <div className="border-t border-border/60 pt-4">
        <Tabs value={current} onValueChange={(value) => setTab(String(value))}>
          <TabsList variant="line" className="max-w-full flex-wrap">
            <TabsTrigger value="legal">Legal</TabsTrigger>
            <TabsTrigger value="care">Care and contact</TabsTrigger>
            <TabsTrigger value="property">Property and documents</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

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
    </PrisonerDocument>
  )
}