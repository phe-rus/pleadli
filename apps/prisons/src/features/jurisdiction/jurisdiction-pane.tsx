import { SettingsCard } from '@/components/settings-card'
import { SettingsTable } from '@/components/settings-table'
import { useFacilityProfile } from '@/features/facility'
import { m } from '@/paraglide/messages'
import { jurisdictionPack, plannedJurisdictions } from './index'

/** Law is an installation fact, independent of the officer's display language. */
export function JurisdictionPane() {
  const { data: profile } = useFacilityProfile()
  const pack = jurisdictionPack(profile.jurisdiction)
  return <div className="flex flex-col gap-6">
    <SettingsCard title={m.jurisdiction_active()} hint={m.jurisdiction_language_note()}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-medium">{pack.name}</p><p className="text-sm text-muted-foreground">{pack.service} · {pack.timezone.label}</p></div>
        <span className="rounded-full bg-foreground/5 px-2.5 py-1 text-xs text-muted-foreground">{m.jurisdiction_default()}</span>
      </div>
    </SettingsCard>
    <section className="flex flex-col gap-1.5">
      <div className="px-1"><h3>{m.jurisdiction_rules_title()}</h3><p className="text-[0.8125rem] text-muted-foreground">{m.jurisdiction_rules_about()}</p></div>
      <SettingsTable rows={[
      { key: 'remand', label: m.jurisdiction_remand_label(), description: m.jurisdiction_remand_value(), control: null },
      { key: 'remission', label: m.jurisdiction_remission_label(), description: m.jurisdiction_remission_value(), control: null },
      { key: 'review', label: m.jurisdiction_review_label(), description: m.jurisdiction_review_value(), control: null },
      { key: 'parole', label: m.jurisdiction_parole_label(), description: m.jurisdiction_parole_value(), control: null },
    ]} />
    </section>
    <SettingsCard title={m.jurisdiction_sources_title()} hint={m.jurisdiction_source_note()}>
      {pack.sources.map(source => <div key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="text-sm underline decoration-border underline-offset-4 hover:decoration-foreground">{source.label()}</a></div>)}
    </SettingsCard>
    <SettingsCard title={m.jurisdiction_roadmap_title()} description={m.jurisdiction_roadmap_about()}>
      {plannedJurisdictions.map(country => <div key={country.id} className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-medium">{country.name()}</p><p className="text-xs text-muted-foreground">{m.jurisdiction_priority({ order: country.priority })}</p></div>
        <span className="text-xs text-muted-foreground">{m.jurisdiction_planned()}</span>
      </div>)}
    </SettingsCard>
  </div>
}
