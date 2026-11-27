import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { RecordList } from '@/features/paper/record-list'
import { MedicalForm, MedicalPaper, medicalKindLabel, medicalOptions, medicalPersonName, medicalStatusLabel, useMedicalExams } from '@/features/medical'
import { format } from '@/lib/date'
import { HealthIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/medical/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...medicalOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Police medical forms (PF3) and post-mortems: who was examined, where, when, and what was found. Each opens as its paper. */
function RouteComponent() {
  const { open } = Route.useSearch()
  const navigate = useNavigate()
  const { data: exams } = useMedicalExams('')
  const waiting = exams.filter((e) => e.status === 'requested').length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.medical"]()}</h1>
          <p>{m["medical.summary"]({ total: exams.length, waiting })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["medical.record"]()} title={m["medical.record"]()} description={m["medical.add_desc"]()} variant="default">
            {({ close, setDirty }) => <MedicalForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <RecordList
        items={exams}
        date={(e) => e.examinedAt ?? e.requestedAt}
        label={(e) => `${medicalKindLabel(e.kind)}: ${medicalPersonName(e)}`}
        detail={(e) => [e.caseReference, e.facility, e.examinerName, medicalStatusLabel(e.status), format(e.examinedAt ?? e.requestedAt, 'd MMM yyyy')].filter(Boolean).join(' · ')}
        value={(e) =>
          e.caseId ? (
            <Link to="/investigations/$caseId" params={{ caseId: e.caseId }} onClick={(event) => event.stopPropagation()} className="text-[0.8125rem]">
              {m["referrals_page.open_case"]()}
            </Link>
          ) : null
        }
        searchText={(e) => [medicalPersonName(e), e.caseReference ?? '', e.facility ?? '', e.examinerName ?? '', e.findings ?? ''].join(' ')}
        paper={(e) => <MedicalPaper exam={e} />}
        windowTitle={(e) => medicalKindLabel(e.kind)}
        empty={m["medical.empty"]()}
        emptyIcon={<HugeiconsIcon icon={HealthIcon} />}
        searchPlaceholder={m["medical.search"]()}
        opened={open ?? null}
        onOpened={(id) => void navigate({ to: '/medical', search: id ? { open: id } : {}, replace: true })}
      />
    </article>
  )
}
