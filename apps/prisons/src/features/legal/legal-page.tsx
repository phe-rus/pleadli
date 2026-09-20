import { RemandList } from '@/features/court-productions'
import { DiaryTable, PendingInstrumentTable, SentenceTable, ThresholdTable } from './legal-tables'
import { useLegalOverview } from './queries'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { m } from '@/paraglide/messages'

/**
 * Legal (docs/prisons/product-map/08 1.1): the court diary, remand
 * thresholds, sentence dates, instruments still awaited, and the s.118
 * pre-session list. Everything here is a view over records: the dates the
 * law sets, computed, with what is owed against each.
 */
export function LegalPage() {
  const { data: legal } = useLegalOverview()
  const overdueThresholds = legal.thresholds.filter((t) => t.daysRemaining < 0).length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_legal_legal()}</h1>
          <p className="md:max-w-xl">
            {m.route_legal_the_court_diary_the_dates_the()}
          </p>
        </div>
      </header>

      <Tabs defaultValue="diary">
        <TabsList variant="line">
          <TabsTrigger value="diary">{m.route_legal_court_diary({ length: legal.diary.length })}</TabsTrigger>
          <TabsTrigger value="thresholds">
            {m.route_legal_remand_thresholds({ length: legal.thresholds.length })}{overdueThresholds > 0 ? m.route_legal_past({ overdueThresholds }) : ''})
          </TabsTrigger>
          <TabsTrigger value="sentences">{m.route_legal_sentences({ length: legal.sentences.length })}</TabsTrigger>
          <TabsTrigger value="instruments">{m.route_legal_documents_pending({ length: legal.pendingInstruments.length })}</TabsTrigger>
          <TabsTrigger value="s118">{m.route_legal_s_118_list()}</TabsTrigger>
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
