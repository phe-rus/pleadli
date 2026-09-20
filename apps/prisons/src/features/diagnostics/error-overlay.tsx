import { m } from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { useState } from 'react'
import { MAX_TRIES, reloadWindow, retry, useErrorState, type ErrorReport } from './error-store'

const sourceLabel: Record<ErrorReport['source'], () => string> = {
  render: () => m.diag_source_render(),
  route: () => m.diag_source_route(),
  window: () => m.diag_source_render(),
  query: () => m.diag_source_route(),
  loop: () => m.diag_source_loop(),
}

function details(report: ErrorReport) {
  return [`${report.name}: ${report.message}`, `Source: ${report.source}`, `Route: ${report.route}`, `At: ${new Date(report.at).toISOString()}`, '', report.stack, report.componentStack].join('\n')
}

/** Like Next.js's error dialog: over everything, what failed and where, the
 * stack, and the choices left. The choices run out on purpose: after
 * `MAX_TRIES` failures, or a burst of errors, only Reload and Copy remain. */
export function ErrorOverlay() {
  const { report, tries, halted, haltedCount } = useErrorState()
  const [copied, setCopied] = useState(false)
  if (!report) return null
  const outOfTries = tries >= MAX_TRIES

  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="diag-title" className="not-typeset fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-background text-foreground shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="diag-title" className="text-base font-semibold">{m.diag_title()}</h2>
            <p className="text-xs text-muted-foreground">{sourceLabel[report.source]()} · {m.diag_subtitle()}</p>
          </div>
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{m.diag_attempt({ tries: Math.min(tries + 1, MAX_TRIES), max: MAX_TRIES })}</span>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {(halted || outOfTries) && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              {halted ? m.diag_stopped({ count: haltedCount, seconds: 3 }) : m.diag_out_of_tries({ max: MAX_TRIES })}
            </p>
          )}
          <div>
            <p className="text-xs text-muted-foreground">{m.diag_message()}</p>
            <p className="font-mono text-sm break-words text-destructive">{report.name}: {report.message}</p>
          </div>
          <p className="text-xs text-muted-foreground">{m.diag_where()}: {report.route} · {new Date(report.at).toLocaleTimeString()}</p>
          {report.stack && (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">{m.diag_stack()}</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">{report.stack}</pre>
            </details>
          )}
          {report.componentStack && (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">{m.diag_component_stack()}</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">{report.componentStack}</pre>
            </details>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(details(report)).then(() => setCopied(true))
            }}
          >
            {copied ? m.diag_copied() : m.diag_copy()}
          </Button>
          <Button variant="secondary" size="sm" onClick={reloadWindow}>{m.diag_reload()}</Button>
          <Button size="sm" onClick={retry} disabled={halted || outOfTries}>{m.diag_try_again()}</Button>
        </footer>
      </div>
    </div>
  )
}
