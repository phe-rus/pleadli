import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { RecordList } from '@/features/paper/record-list'
import { RecordPaper } from '@/features/paper/record-paper'
import { IncidentForm, incidentPersonName, incidentsOptions, useIncidents, type Incident } from '@/features/incidents'
import { format } from '@/lib/date'
import { SirenIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { RichTextPreview, richTextToPlainText } from '@pleadli/rich-text'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/incidents/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...incidentsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

/** An incident as the station reports it: what, when, where, who reported it, and the account. */
function IncidentPaper({ incident }: { incident: Incident }) {
  const person = incidentPersonName(incident)
  return (
    <RecordPaper
      entityType="incident"
      entityId={incident.id}
      title={m["incidents_page.paper_title"]()}
      details={[
        { label: m["incidents_page.what"](), value: incident.summary },
        { label: m["incidents_page.when"](), value: format(incident.occurredAt, 'PPp') },
        ...(incident.location ? [{ label: m["incidents_page.where"](), value: incident.location }] : []),
        ...(person ? [{ label: m["incidents_page.reported_by"](), value: person }] : []),
      ]}
      events={[
        { at: incident.occurredAt, label: m["incidents_page.happened"]() },
        { at: incident.createdAt, label: m["incidents_page.recorded"]() },
      ]}
      edit={(done) => <IncidentForm key={incident.id} incident={incident} onSuccess={done} />}
    >
      <h2>{incident.summary}</h2>
      <section className="mb-5 flex flex-col gap-0.5">
        <PaperField label={m["incidents_page.when"]()}>{format(incident.occurredAt, 'PPPPp')}</PaperField>
        {incident.location && <PaperField label={m["incidents_page.where"]()}>{incident.location}</PaperField>}
        {person && <PaperField label={m["incidents_page.reported_by"]()}>{person}</PaperField>}
        <PaperField label={m["incidents_page.recorded"]()}>{format(incident.createdAt, 'PPp')}</PaperField>
      </section>
      <RichTextPreview value={incident.description} className="[&_p]:mb-3" />
      <section className="mt-12 flex justify-end">
        <SignatureLine caption={m["incidents_page.recording_officer"]()} />
      </section>
    </RecordPaper>
  )
}

/** Things that happened or were reported, by month, each opening as its report. */
function RouteComponent() {
  const { open } = Route.useSearch()
  const navigate = useNavigate()
  const { data: incidents } = useIncidents('')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.incidents"]()}</h1>
          <p>{incidents.length === 1 ? m["incidents_page.count_one"]() : m["incidents_page.count"]({ count: incidents.length })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["incidents_page.new"]()} title={m["incidents_page.new"]()} description={m["incidents_page.add_desc"]()} variant="default">
            {({ close, setDirty }) => <IncidentForm onSuccess={close} onDirtyChange={setDirty} />}
          </PanelButton>
        </div>
      </header>

      <RecordList
        items={incidents}
        date={(i) => i.occurredAt}
        label={(i) => i.summary}
        detail={(i) => [format(i.occurredAt, 'd MMM, HH:mm'), i.location, incidentPersonName(i)].filter(Boolean).join(' · ')}
        searchText={(i) => [i.summary, i.location ?? '', incidentPersonName(i) ?? '', richTextToPlainText(i.description)].join(' ')}
        paper={(i) => <IncidentPaper incident={i} />}
        windowTitle={(i) => i.summary}
        empty={m["incidents_page.empty"]()}
        emptyIcon={<HugeiconsIcon icon={SirenIcon} />}
        searchPlaceholder={m["incidents_page.search"]()}
        opened={open ?? null}
        onOpened={(id) => void navigate({ to: '/incidents', search: id ? { open: id } : {}, replace: true })}
      />
    </article>
  )
}
