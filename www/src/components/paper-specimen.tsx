import { cn } from '@pleadli/ui/lib/utils'

export type SpecimenKind = 'police_bond' | 'charge_sheet' | 'summons' | 'letter' | 'release_warrant'

type Line = { label: string; value: string }
type Sheet = { head: string[]; title: string; ref: string; lines: Line[]; body: string; sign: string; code: string }

/** Fictional case PILOT-UG-2026-001. Every name here is invented; nothing is a real person or record. */
const sheets: Record<SpecimenKind, Sheet> = {
  police_bond: {
    head: ['The Republic of Uganda', 'Uganda Police Force', 'Kampala Central Police Station'],
    title: 'Police Bond',
    ref: 'CRB 41/2026',
    lines: [
      { label: 'Released on bond', value: 'Specimen Person A.' },
      { label: 'Offence', value: 'Theft, section 254' },
      { label: 'Surety', value: 'Specimen Person B.' },
      { label: 'To appear', value: 'Buganda Road Court, 24 Nov 2026' },
    ],
    body: 'The person named above is released on police bond and must appear at the court and on the day stated.',
    sign: 'Officer in charge',
    code: 'PB4K-7T2M-9XQ3',
  },
  charge_sheet: {
    head: ['The Republic of Uganda', 'Office of the Director of Public Prosecutions', 'Resident State Attorney, Buganda Road'],
    title: 'Charge Sheet',
    ref: 'SD 118/2026',
    lines: [
      { label: 'Accused', value: 'Specimen Person A.' },
      { label: 'Count 1', value: 'Theft, contrary to section 254' },
      { label: 'Particulars', value: 'Stole goods valued at UGX 1,200,000' },
      { label: 'Police file', value: 'CRB 41/2026' },
    ],
    body: 'Having reviewed the police file, the charge above is approved and the accused is to be brought before the court.',
    sign: 'State Attorney',
    code: 'CS9D-3R6W-2LHN',
  },
  summons: {
    head: ['The Republic of Uganda', 'In the Chief Magistrate’s Court of Uganda', 'at Buganda Road'],
    title: 'Summons to an Accused Person',
    ref: 'Criminal Case 214/2026',
    lines: [
      { label: 'Uganda', value: 'versus Specimen Person A.' },
      { label: 'Sitting', value: 'Hearing, Court 2, 09:00' },
      { label: 'Date', value: '24 November 2026' },
      { label: 'Charge', value: 'Theft' },
    ],
    body: 'You are summoned to appear before this court on the date and at the time stated, to answer the charge against you.',
    sign: 'Registrar',
    code: 'SU2F-8V5C-4PJE',
  },
  letter: {
    head: ['Specimen & Co. Advocates', 'Plot 12, Kampala Road', 'Kampala'],
    title: 'Letter to the Court',
    ref: 'Our ref: SC/2026/019',
    lines: [
      { label: 'To', value: 'The Registrar, Buganda Road' },
      { label: 'Re', value: 'Criminal Case 214/2026' },
      { label: 'Client', value: 'Specimen Person A.' },
      { label: 'Date', value: '20 November 2026' },
    ],
    body: 'We act for the accused in the matter above and ask that the hearing be moved to a date after the witness has returned.',
    sign: 'Advocate',
    code: 'LT7H-1N4B-6KDS',
  },
  release_warrant: {
    head: ['The Republic of Uganda', 'Uganda Prisons Service', 'Luzira Upper Prison'],
    title: 'Warrant of Release',
    ref: 'Prisoner 0481/2026',
    lines: [
      { label: 'Prisoner', value: 'Specimen Person A.' },
      { label: 'Authority', value: 'Court order, Criminal Case 214/2026' },
      { label: 'Checks', value: 'Court, property and medical cleared' },
      { label: 'Released', value: '27 November 2026' },
    ],
    body: 'Every authority for this person’s custody has been checked. The person is released and signs for property returned.',
    sign: 'Officer in charge',
    code: 'RW5J-9M2X-3TGA',
  },
}

/** A calm, printed-looking grid made from the code; a picture of a mark, not a scannable one. */
function Mark({ code }: { code: string }) {
  const cells = 7
  let seed = 0
  for (const ch of code) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0
  const on = Array.from({ length: cells * cells }, (_, i) => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const corner = (i % cells < 2 || i % cells > cells - 3) && (Math.floor(i / cells) < 2 || Math.floor(i / cells) > cells - 3)
    return corner || seed % 3 !== 0
  })
  return (
    <svg viewBox={`0 0 ${cells} ${cells}`} className="size-12 shrink-0 text-neutral-900" aria-hidden="true">
      {on.map((filled, i) => filled && <rect key={i} x={i % cells} y={Math.floor(i / cells)} width="0.88" height="0.88" fill="currentColor" />)}
    </svg>
  )
}

/** A paper as it prints, drawn in HTML so it stays sharp on every screen. Always marked as a specimen. */
export function PaperSpecimen({ kind, specimen, className }: { kind: SpecimenKind; specimen: string; className?: string }) {
  const sheet = sheets[kind]
  return (
    <figure
      className={cn(
        'relative m-0 flex aspect-[1/1.22] w-full flex-col gap-3 overflow-hidden rounded-md border border-neutral-300 bg-white p-5 text-neutral-900 shadow-xl shadow-black/10 sm:p-7',
        className,
      )}
      style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
    >
      <header className="flex flex-col items-center gap-0.5 text-center text-[0.62rem] font-semibold uppercase leading-tight tracking-wide sm:text-[0.7rem]">
        {sheet.head.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </header>
      <div className="flex items-baseline justify-between gap-3 border-y border-neutral-300 py-2">
        <span className="text-sm font-bold uppercase sm:text-base">{sheet.title}</span>
        <span className="shrink-0 text-[0.65rem] text-neutral-600 sm:text-xs">{sheet.ref}</span>
      </div>
      <dl className="m-0 flex flex-col gap-1.5 text-[0.7rem] sm:text-xs">
        {sheet.lines.map((line) => (
          <div key={line.label} className="flex items-baseline gap-2">
            <dt className="m-0 w-24 shrink-0 text-neutral-500 sm:w-28">{line.label}</dt>
            <dd className="m-0 font-medium">{line.value}</dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-[0.7rem] leading-relaxed text-neutral-700 sm:text-xs">{sheet.body}</p>
      <footer className="mt-auto flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1 text-[0.62rem] text-neutral-600 sm:text-[0.7rem]">
          <span className="block h-px w-32 bg-neutral-500" />
          <span>{sheet.sign}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[0.58rem] leading-tight text-neutral-600 sm:text-[0.65rem]">{sheet.code}</span>
          <Mark code={sheet.code} />
        </div>
      </footer>
      <span
        className="pointer-events-none absolute right-3 top-3 rotate-6 rounded border border-red-700/60 px-1.5 py-0.5 font-sans text-[0.58rem] font-semibold uppercase tracking-widest text-red-700/70"
        aria-hidden="true"
      >
        {specimen}
      </span>
      <figcaption className="sr-only">{specimen}: {sheet.title}</figcaption>
    </figure>
  )
}
