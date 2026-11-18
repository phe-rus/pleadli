import { File01Icon, FileAttachmentIcon, Image01Icon, MusicNote01Icon, ScanIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { cn } from '@pleadli/ui/lib/utils'
import { WindowControls } from '@pleadli/ui/window-controls'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { LinkArrow } from '@/components/link-arrow'
import { PaperSpecimen } from '@/components/paper-specimen'
import { Reveal } from '@/components/reveal'
import * as m from '@/paraglide/messages'

const wrap = 'container w-full md:max-w-6xl'

const noop = () => {}
const controlLabels = { group: 'Window', close: 'Close', minimize: 'Minimize', maximize: 'Maximize' }

/** A small window drawn like our apps: grey bar with our own window buttons and the open tab as a pill,
 * a small corner, a soft shadow. For show only; nothing in it can be pressed. */
function MiniWindow({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-[5px] bg-background shadow-[0_1px_2px_#0000000d,0_12px_30px_-18px_#00000047] ring-1 ring-black/10', className)}>
      <div className="flex h-9 items-center gap-2 bg-sidebar px-2.5">
        <div inert aria-hidden="true" className="pointer-events-none">
          <WindowControls focused labels={controlLabels} onClose={noop} onMinimize={noop} onToggleMaximize={noop} />
        </div>
        <span className="ml-1 flex h-6 min-w-0 items-center rounded-md bg-background px-2.5 text-[0.6875rem] shadow-xs ring-1 ring-black/[0.06]">
          <span className="truncate">{title}</span>
        </span>
      </div>
      <div className="p-3 text-xs">{children}</div>
    </div>
  )
}

const files = [
  { icon: File01Icon, name: 'Statement, complainant.pdf', note: '3 pages' },
  { icon: Image01Icon, name: 'Exhibit 3, the door.jpg', note: 'Photo' },
  { icon: FileAttachmentIcon, name: 'Charge sheet.docx', note: 'Word' },
  { icon: ScanIcon, name: 'Letter from the court.pdf', note: 'Scanned' },
  { icon: MusicNote01Icon, name: 'Interview, 14 minutes.m4a', note: 'Recording' },
]

function Row({ title, body, link, to, flip, children }: { title: string; body: string; link: string; to: '/docs/documents' | '/docs/applications'; flip?: boolean; children: ReactNode }) {
  return (
    <Reveal className={cn('grid items-center gap-10 md:grid-cols-2 md:gap-16', flip && 'md:[&>:first-child]:order-2')}>
      <div className="flex max-w-md flex-col items-start gap-3">
        <h3 className="text-2xl! font-bold tracking-tight md:text-3xl!">{title}</h3>
        <p className="text-lg! leading-relaxed text-muted-foreground">{body}</p>
        <Link to={to} className="text-base font-medium text-primary-ink hover:underline">
          {link} <LinkArrow />
        </Link>
      </div>
      {children}
    </Reveal>
  )
}

/** Three rows, each a short idea beside a loose collage of small windows of different sizes. */
export function MakeItYourOwn() {
  return (
    <section className="border-t border-border/60 bg-muted/60" aria-labelledby="own-title">
      <div className={cn(wrap, 'flex flex-col gap-20 py-16 md:gap-32 md:py-28')}>
        <Reveal className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
          <h2 id="own-title" className="text-3xl! font-bold tracking-tight md:text-5xl!">{m['own.title']()}</h2>
          <Link to="/docs/documents" className="text-base font-medium text-primary-ink hover:underline">
            {m['own.link']()} <LinkArrow />
          </Link>
        </Reveal>

        <Row title={m['own.paper_title']()} body={m['own.paper_body']()} link={m['own.paper_link']()} to="/docs/documents">
          <div className="relative mx-auto h-[26rem] w-full max-w-lg md:h-[30rem]">
            <PaperSpecimen kind="charge_sheet" specimen="Specimen" className="absolute right-[2%] top-0 w-[52%] -rotate-1" />
            <PaperSpecimen kind="police_bond" specimen="Specimen" className="absolute left-0 top-[18%] w-[40%] rotate-1" />
            <PaperSpecimen kind="release_warrant" specimen="Specimen" className="absolute bottom-0 right-[18%] w-[44%] rotate-1" />
          </div>
        </Row>

        <Row flip title={m['own.file_title']()} body={m['own.file_body']()} link={m['own.file_link']()} to="/docs/documents">
          <div className="relative mx-auto h-[24rem] w-full max-w-lg md:h-[26rem]">
            <MiniWindow title="CRB 41/2026, Files" className="absolute left-0 top-0 w-[78%]">
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {files.map((file) => (
                  <li key={file.name} className="flex items-center gap-2 rounded-md px-2 py-1.5 odd:bg-muted/60">
                    <HugeiconsIcon icon={file.icon} className="size-4! shrink-0 text-primary-ink" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">{file.note}</span>
                  </li>
                ))}
              </ul>
            </MiniWindow>
            <MiniWindow title="Statement, complainant.pdf" className="absolute bottom-0 right-0 w-[56%]">
              <div className="flex flex-col gap-1.5">
                <span className="h-2 w-3/4 rounded bg-muted" />
                <span className="h-2 w-full rounded bg-muted" />
                <span className="h-2 w-5/6 rounded bg-muted" />
                <span className="h-2 w-2/3 rounded bg-muted" />
              </div>
            </MiniWindow>
          </div>
        </Row>

        <Row title={m['own.lang_title']()} body={m['own.lang_body']()} link={m['own.lang_link']()} to="/docs/applications">
          <div className="relative mx-auto h-[24rem] w-full max-w-lg md:h-[26rem]">
            <MiniWindow title="Pleadli Police · EN" className="absolute left-0 top-0 w-[58%]">
              <p className="m-0 text-base font-semibold">Today</p>
              <p className="m-0 mt-1 text-muted-foreground">Cannot wait. 8 hours left. Must be in court or released.</p>
            </MiniWindow>
            <MiniWindow title="Pleadli Police · SW" className="absolute right-0 top-[28%] w-[58%]">
              <p className="m-0 text-base font-semibold">Leo</p>
              <p className="m-0 mt-1 text-muted-foreground">Haiwezi kusubiri. Saa 8 zimebaki. Lazima awe mahakamani au aachiliwe.</p>
            </MiniWindow>
            <MiniWindow title="Pleadli Police · FR" className="absolute bottom-0 left-[8%] w-[58%]">
              <p className="m-0 text-base font-semibold">Aujourd’hui</p>
              <p className="m-0 mt-1 text-muted-foreground">Ne peut pas attendre. 8 heures restantes. Doit être devant le tribunal ou libéré.</p>
            </MiniWindow>
          </div>
        </Row>
      </div>
    </section>
  )
}
