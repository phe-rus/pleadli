import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { EmptyNote } from '@/components/planned'
import { MedicalForm, medicalKindLabel, medicalOptions, medicalStatusLabel, useMedicalExams } from '@/features/medical'
import { personFullName } from '@/features/people'
import { format } from '@/lib/date'
import { createFileRoute } from '@tanstack/react-router'
import { Group, GroupRow } from '@pleadli/ui/grouped'

export const Route = createFileRoute('/_public/medical/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...medicalOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** Police medical forms (PF3) and post-mortems: who was examined, where, when, and what was found. */
function RouteComponent() {
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

      {exams.length === 0 ? (
        <EmptyNote>{m["medical.empty"]()}</EmptyNote>
      ) : (
        <Group>
          {exams.map((e) => (
            <GroupRow
              key={e.id}
              label={<span className="font-medium">{`${medicalKindLabel(e.kind)}: ${personFullName({ firstName: e.personFirstName, lastName: e.personLastName, otherNames: e.personOtherNames })}`}</span>}
              detail={[e.caseReference, e.facility, e.examinerName, e.findings].filter(Boolean).join(' · ')}
              value={
                <span className="flex flex-col items-end text-xs leading-tight">
                  <span>{format(e.examinedAt ?? e.requestedAt, 'd MMM yyyy')}</span>
                  <span className={e.status === 'requested' ? 'text-amber-700 dark:text-amber-300' : ''}>{medicalStatusLabel(e.status)}</span>
                </span>
              }
            />
          ))}
        </Group>
      )}
    </article>
  )
}
