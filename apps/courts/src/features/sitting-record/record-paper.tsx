import { format } from 'date-fns/format'
import { purposeLabel } from '@/features/sittings'
import { appearanceRoleLabel, attendanceLabel, noteKindLabel, type SittingDetail } from './schema'

/** A reading view of current sitting data, not a separate signed document.
 * The signature covers the domain's canonical sitting, notes and appearances;
 * the case heading here is current and is outside that signed payload. */
export function RecordPaper({ detail }: { detail: SittingDetail }) {
  const { sitting, record } = detail
  return (
    <section className="paper mx-auto w-full max-w-[210mm] p-8 text-sm leading-relaxed sm:p-[16mm]" aria-label="Sitting record reading view" data-document-paper>
      <p className="mb-6 border-b border-foreground/20 pb-3 text-center text-xs font-semibold tracking-widest uppercase">Working view of sitting record</p>
      <header className="mb-8 text-center">
        <p>{detail.case.courtNumber}</p>
        <p className="font-semibold">{detail.case.title}</p>
        <h2 className="mt-5 text-base font-semibold uppercase">Notes and appearances</h2>
        <p>{purposeLabel(sitting.purpose)} · {format(sitting.scheduledAt, 'PPp')}{sitting.courtroom ? ` · ${sitting.courtroom}` : ''}</p>
      </header>
      <h3 className="mb-3 font-semibold">Appearances</h3>
      {detail.appearances.length ? (
        <ul className="mb-8 space-y-2">
          {detail.appearances.map((appearance) => (
            <li key={appearance.id}>
              <span className="font-medium">{appearance.name}</span>, {appearanceRoleLabel(appearance.role)}. {attendanceLabel(appearance.attendance)}.
              {appearance.note && <p className="whitespace-pre-wrap">{appearance.note}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="mb-8 text-muted-foreground">No appearances recorded.</p>}
      <h3 className="mb-3 font-semibold">Notes of the sitting</h3>
      {detail.notes.length ? detail.notes.map((note) => (
        <section key={note.id} className="mb-5">
          <p className="mb-1 text-xs text-muted-foreground">{format(note.at, 'PPp')} · {noteKindLabel(note.kind)}{note.speaker ? ` · ${note.speaker}` : ''}</p>
          <p className="whitespace-pre-wrap">{note.body}</p>
        </section>
      )) : <p className="text-muted-foreground">No notes recorded.</p>}
      {sitting.outcome && <p className="mt-8 whitespace-pre-wrap"><strong>Recorded outcome.</strong> {sitting.outcome}</p>}
      <footer className="mt-10 border-t pt-4 text-xs text-muted-foreground">
        {record.signedAt ? (
          <>
            <p>Notes and appearances signed by {record.signedBy} on {format(record.signedAt, 'PPp')}.</p>
            <p>{record.intact === false ? 'Warning: record changed since signing.' : record.intact === true ? 'Stored record matches its signature hash.' : 'Integrity status unavailable.'}</p>
          </>
        ) : <p>Unsigned. This view does not sign or close the sitting.</p>}
        <p className="mt-2">Current case heading. This reading view is not a separate certified document. Machine transcripts are not included.</p>
      </footer>
    </section>
  )
}
