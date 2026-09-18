import { RemandList, remandListOptions } from '@/features/court-productions'
import { DiaryTable, legalOverviewOptions, PendingInstrumentTable, SentenceTable, ThresholdTable, useLegalOverview } from '@/features/legal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/legal/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...legalOverviewOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...remandListOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

/**
 * Legal (docs/prisons/product-map/08 1.1): the court diary, remand
 * thresholds, sentence dates, instruments still awaited, and the s.118
 * pre-session list. Everything here is a view over records: the dates the
 * law sets, computed, with what is owed against each.
 */
function RouteComponent() {
  const { data: legal } = useLegalOverview()
  const overdueThresholds = legal.thresholds.filter((t) => t.daysRemaining < 0).length

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Legal</h1>
        <p className="md:max-w-xl">
          The court diary, the dates the law sets, and the documents still awaited. Outcomes are applied here: a remand books the next date, a
          conviction asks for the sentence, bail or acquittal points at discharge.
        </p>
      </section>

      <Tabs defaultValue="diary">
        <TabsList variant="line">
          <TabsTrigger value="diary">Court diary ({legal.diary.length})</TabsTrigger>
          <TabsTrigger value="thresholds">
            Remand thresholds ({legal.thresholds.length}
            {overdueThresholds > 0 ? `, ${overdueThresholds} past` : ''})
          </TabsTrigger>
          <TabsTrigger value="sentences">Sentences ({legal.sentences.length})</TabsTrigger>
          <TabsTrigger value="instruments">Documents pending ({legal.pendingInstruments.length})</TabsTrigger>
          <TabsTrigger value="s118">s.118 list</TabsTrigger>
        </TabsList>

        <TabsContent value="diary" className="pt-4">
          <DiaryTable diary={legal.diary} />
        </TabsContent>
        <TabsContent value="thresholds" className="pt-4">
          <ThresholdTable rows={legal.thresholds} />
        </TabsContent>
        <TabsContent value="sentences" className="pt-4">
          <SentenceTable rows={legal.sentences} unsentenced={legal.unsentenced} />
        </TabsContent>
        <TabsContent value="instruments" className="pt-4">
          <PendingInstrumentTable rows={legal.pendingInstruments} />
        </TabsContent>
        <TabsContent value="s118" className="pt-4">
          <RemandList />
        </TabsContent>
      </Tabs>
    </article>
  )
}
