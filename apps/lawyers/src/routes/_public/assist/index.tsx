import { SettingsCard } from '@/components/settings-card'
import { AssistPanel, useAssistSettings } from '@/features/assist'
import { useSessionStatus } from '@/features/installation'
import { mattersOptions } from '@/features/matters'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

type Search = { matter?: string }

export const Route = createFileRoute('/_public/assist/')({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s.matter === 'string' ? { matter: s.matter } : {}),
  component: RouteComponent,
})

/** Assist from anywhere: pick a matter and ask. When it is off, say so and
 * say who turns it on, instead of leaving the button to be found. */
function RouteComponent() {
  const { matter } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const { data: settings, isError } = useAssistSettings()
  const { data: session } = useSessionStatus()
  const isAdmin = session?.actor?.isAdmin === true
  const { data: matters = [] } = useQuery({ ...mattersOptions('open'), enabled: settings?.ready === true })
  const items = matters.map((mt) => ({ value: mt.id, label: mt.courtNumber ? `${mt.courtNumber} · ${mt.title}` : mt.title }))

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["assist_page.title"]()}</h1>
          <p>{m["assist_page.lead"]()}</p>
        </div>
      </header>

      {isError ? (
        <p className="text-muted-foreground">{m["assist_page.not_for_role"]()}</p>
      ) : settings && !settings.ready ? (
        <div className="max-w-2xl">
          <SettingsCard
            title={m["assist_page.off_title"]()}
            description={m["assist_page.off_description"]()}
            hint={isAdmin ? m["assist_page.off_admin"]() : m["assist_page.off_ask_admin"]()}
            action={
              isAdmin && (
                <Button size="sm" nativeButton={false} render={<Link to="/settings/$section" params={{ section: 'assist' }} />}>
                  {m["assist_page.turn_on"]()}
                </Button>
              )
            }
          />
        </div>
      ) : settings ? (
        <div className="flex max-w-3xl flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assist-matter">{m["assist_page.which_matter"]()}</label>
            <Select items={items} value={matter ?? ''} onValueChange={(v) => void navigate({ search: v ? { matter: v } : {} })}>
              <SelectTrigger id="assist-matter" className="w-full">
                <SelectValue placeholder={m["assist_page.choose_matter"]()} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {items.length === 0 && <p className="text-muted-foreground">{m["assist_page.no_matters"]()}</p>}
          </div>
          {matter && (
            <div key={matter} className="flex min-h-[28rem] flex-col rounded-xl border border-border/70 bg-card">
              <AssistPanel matterId={matter} />
            </div>
          )}
        </div>
      ) : null}
    </article>
  )
}
