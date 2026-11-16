import { RemandList } from '@/features/court-productions'
import { DiaryTable, PendingInstrumentTable, SentenceTable, ThresholdTable } from './legal-tables'
import { useLegalOverview } from './queries'
import { Segmented } from '@pleadli/ui/segmented'
import { useState } from 'react'
import { m } from '@/paraglide/messages'

/**
 * Legal (docs/prisons/product-map/08 1.1): the court diary, remand
 * thresholds, sentence dates, instruments still awaited, and the s.118
 * pre-session list. Everything here is a view over records: the dates the
 * law sets, computed, with what is owed against each.
 */
export function LegalPage() {
  const { data: legal } = useLegalOverview()
  const [view, setView] = useState<'diary' | 'thresholds' | 'sentences' | 'instruments' | 's118'>('diary')
  const overdueThresholds = legal.thresholds.filter((t) => t.daysRemaining < 0).length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.nav_court()}</h1>
          <p className="md:max-w-xl">
            {m.route_legal_the_court_diary_the_dates_the()}
          </p>
        </div>
      </header>

      <Segmented
        label={m.nav_court()}
        value={view}
        onChange={setView}
        className="max-w-full flex-wrap self-start"
        items={[
          { value: 'diary', label: m.route_legal_court_diary({ length: legal.diary.length }) },
          { value: 'thresholds', label: m.route_legal_remand_thresholds({ length: legal.thresholds.length }) + (overdueThresholds > 0 ? m.route_legal_past({ overdueThresholds }) : '') + ')' },
          { value: 'sentences', label: m.route_legal_sentences({ length: legal.sentences.length }) },
          { value: 'instruments', label: m.route_legal_documents_pending({ length: legal.pendingInstruments.length }) },
          { value: 's118', label: m.route_legal_s_118_list() },
        ]}
      />

      {view === 'diary' && <DiaryTable diary={legal.diary} />}
      {view === 'thresholds' && <ThresholdTable rows={legal.thresholds} />}
      {view === 'sentences' && <SentenceTable rows={legal.sentences} unsentenced={legal.unsentenced} />}
      {view === 'instruments' && <PendingInstrumentTable rows={legal.pendingInstruments} />}
      {view === 's118' && <RemandList />}
    </article>
  )
}
