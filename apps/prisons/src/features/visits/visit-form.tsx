import { useReportDirty } from '@/hooks/use-report-dirty'
import { ApiError } from '@/lib/api'
import { usePermissions } from '@/features/session'
import { RichTextInput } from '@pleadli/rich-text'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useApprovedVisitors, useCreateVisit, useVisitorSearch, visitRulesOptions } from './queries'
import { idTypes, isOutsideVisitingHours, isPrivilegedType, isSpecialType, visitTypes, type Visit } from './schema'

export type VisitFormProps = {
  prisonerId: string
  onSuccess?: (visit: Visit) => void
  onDirtyChange?: (dirty: boolean) => void
}

function toDatetimeLocal(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type Source = 'approved' | 'find' | 'new'

const sourceLabels: Record<Source, string> = { approved: 'Approved for this prisoner', find: 'Find a registered visitor', new: 'New visitor' }

function Chip({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-50',
        selected ? 'border-primary bg-primary/10' : 'border-border/60 hover:border-primary/40 hover:bg-primary/5',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Schedules a visit in three short parts: who is coming, when and what kind,
 * and anything worth noting. The gate checks (ID, search, items) happen at
 * check-in, not here. A visitor is approved for a prisoner once and reused.
 */
export function VisitForm({ prisonerId, onSuccess, onDirtyChange }: VisitFormProps) {
  const createVisit = useCreateVisit()
  const { data: approved } = useApprovedVisitors(prisonerId)
  const { data: rules } = useQuery(visitRulesOptions())
  const { can } = usePermissions()

  const [source, setSource] = useState<Source | null>(null)
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null)
  const [search, setSearch] = useState('')
  const { data: found } = useVisitorSearch(search)
  const activeSource: Source = source ?? (approved && approved.length > 0 ? 'approved' : 'new')

  const form = useAppForm({
    defaultValues: {
      visitType: 'ordinary',
      visitedAt: toDatetimeLocal(Date.now()),
      partySize: '1',
      notes: '',
      overLimitReason: '',
      fullName: '',
      idType: 'national_id',
      idNumber: '',
      phone: '',
      relationship: '',
    },
    onSubmit: async ({ value, formApi }) => {
      const visitedAt = new Date(value.visitedAt).getTime()
      if (Number.isNaN(visitedAt)) return void t.error('Choose the date and time of the visit.')
      if (activeSource === 'new') {
        if (!value.fullName.trim()) return void t.error('Enter the visitor’s full name.')
        if (!value.idNumber.trim()) return void t.error('Every visitor needs a photographic ID.')
      } else if (!selected) {
        return void t.error('Choose who is visiting.')
      }
      try {
        const result = await createVisit.mutateAsync({
          prisonerId,
          visitType: value.visitType,
          visitedAt,
          partySize: Math.max(1, Number(value.partySize) || 1),
          notes: isPrivilegedType(value.visitType) ? '' : value.notes,
          overLimitReason: value.overLimitReason,
          relationship: activeSource === 'new' ? value.relationship : undefined,
          ...(activeSource === 'new'
            ? {
                newVisitor: {
                  fullName: value.fullName,
                  idType: value.idType,
                  idNumber: value.idNumber,
                  phone: value.phone,
                  relationship: value.relationship,
                },
              }
            : { visitorId: selected!.id }),
        })
        t.success(result.status === 'requested' ? 'Visit requested' : 'Visit scheduled', {
          description: result.status === 'requested' ? 'It waits for the Officer in Charge to authorise it.' : result.visitorName,
        })
        formApi.reset()
        onSuccess?.(result)
      } catch (error) {
        t.error('Could not save the visit', { description: error instanceof ApiError ? error.message : 'Please try again.' })
      }
    },
  })

  useReportDirty(form, onDirtyChange)

  return (
    <form
      className="flex flex-1 flex-col gap-5 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        form.handleSubmit()
      }}
    >
      <section className="flex flex-col gap-2.5">
        <h3 className="text-xs font-medium">1. Who is visiting</h3>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(sourceLabels) as Source[]).map((key) => (
            <Button key={key} type="button" size="xs" variant={activeSource === key ? 'default' : 'secondary'} onClick={() => setSource(key)}>
              {sourceLabels[key]}
            </Button>
          ))}
        </div>

        {activeSource === 'approved' && (
          <div className="flex flex-wrap gap-2">
            {approved && approved.length > 0 ? (
              approved.map((visitor) => (
                <Chip
                  key={visitor.visitorId}
                  selected={selected?.id === visitor.visitorId}
                  disabled={visitor.status === 'suspended'}
                  onClick={() => setSelected({ id: visitor.visitorId, name: visitor.fullName })}
                >
                  <span className="font-medium">{visitor.fullName}</span>
                  <span className="text-muted-foreground">
                    {visitor.relationship ?? 'Visitor'} · {visitor.visitsCompleted} visit{visitor.visitsCompleted === 1 ? '' : 's'}
                  </span>
                  {visitor.status === 'suspended' && <Badge variant="destructive">Suspended</Badge>}
                </Chip>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No one is approved for this prisoner yet. Find a registered visitor or add a new one.</p>
            )}
          </div>
        )}

        {activeSource === 'find' && (
          <div className="flex flex-col gap-2">
            <Input autoComplete="off" placeholder="Search by name, ID number or phone" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {found?.map((visitor) => (
                <Chip key={visitor.id} selected={selected?.id === visitor.id} onClick={() => setSelected({ id: visitor.id, name: visitor.fullName })}>
                  <span className="font-medium">{visitor.fullName}</span>
                  <span className="text-muted-foreground">{visitor.idNumber ?? 'No ID number'}</span>
                </Chip>
              ))}
              {search.trim().length >= 2 && found?.length === 0 && <p className="text-xs text-muted-foreground">No registered visitor matches.</p>}
            </div>
            <FieldDescription>Choosing someone here approves them for this prisoner too.</FieldDescription>
          </div>
        )}

        {activeSource === 'new' && (
          <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
            <div className="flex flex-wrap gap-3 *:min-w-48 *:flex-1">
              <form.AppField name="fullName">{(f) => <f.input label="Full name" autoComplete="name" />}</form.AppField>
              <form.AppField name="relationship">{(f) => <f.input label="Relationship" placeholder="e.g. wife, brother, lawyer" autoComplete="off" />}</form.AppField>
            </div>
            <div className="flex flex-wrap gap-3 *:min-w-48 *:flex-1">
              <form.AppField name="idType">{(f) => <f.select label="ID type" options={[...idTypes]} />}</form.AppField>
              <form.AppField name="idNumber">{(f) => <f.input label="ID number" autoComplete="off" />}</form.AppField>
            </div>
            <form.AppField name="phone">{(f) => <f.input label="Phone (optional)" type="tel" autoComplete="tel" />}</form.AppField>
            <FieldDescription>If this ID is already registered, that visitor is reused instead of added twice.</FieldDescription>
          </div>
        )}

        {activeSource !== 'new' && selected && <p className="text-xs">Selected: <span className="font-medium">{selected.name}</span></p>}
      </section>

      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const at = new Date(values.visitedAt).getTime()
          const privileged = isPrivilegedType(values.visitType)
          const party = Math.max(1, Number(values.partySize) || 1)
          const held = !privileged && (isSpecialType(values.visitType) || (rules && !Number.isNaN(at) && isOutsideVisitingHours(rules, at)))
          const overParty = !privileged && rules ? party > rules.maxVisitorsPerVisit : false
          return (
            <>
              <section className="flex flex-col gap-3">
                <h3 className="text-xs font-medium">2. When and what kind</h3>
                <div className="flex flex-wrap gap-3 *:min-w-48 *:flex-1">
                  <form.AppField name="visitType">{(f) => <f.select label="Visit type" options={[...visitTypes]} />}</form.AppField>
                  <form.AppField name="visitedAt">
                    {(f) => (
                      <Field>
                        <FieldLabel>Date and time</FieldLabel>
                        <Input type="datetime-local" value={f.state.value} onChange={(event) => f.handleChange(event.target.value)} />
                      </Field>
                    )}
                  </form.AppField>
                  <form.AppField name="partySize">{(f) => <f.input label="Visitors in the party" type="number" min={1} inputMode="numeric" autoComplete="off" />}</form.AppField>
                </div>

                {privileged && (
                  <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                    Seen within sight but not within hearing of an officer. Nothing said is recorded, so no notes are kept.
                  </p>
                )}
                {held && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                    This is a special authorization or falls outside visiting hours, so it is sent to the Officer in Charge to approve first.
                  </p>
                )}
                {overParty && rules && (
                  <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                    <span>This facility allows {rules.maxVisitorsPerVisit} visitors at a time.</span>
                    {can('authorise.exception') ? (
                      <form.AppField name="overLimitReason">{(f) => <f.input label="Reason for the exception" autoComplete="off" />}</form.AppField>
                    ) : (
                      <span>An Officer in Charge can authorise an exception.</span>
                    )}
                  </div>
                )}
              </section>

              {!privileged && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium">3. Notes</h3>
                  <form.AppField name="notes">
                    {(f) => (
                      <Field>
                        <FieldLabel>Notes (optional)</FieldLabel>
                        <RichTextInput value={f.state.value} onChange={f.handleChange} placeholder="Anything the gate or supervising officer should know" />
                      </Field>
                    )}
                  </form.AppField>
                </section>
              )}

              <DrawerFooter>
                <form.AppForm>
                  <form.submit label={held ? 'Request visit' : 'Schedule visit'} />
                </form.AppForm>
              </DrawerFooter>
            </>
          )
        }}
      </form.Subscribe>
    </form>
  )
}
