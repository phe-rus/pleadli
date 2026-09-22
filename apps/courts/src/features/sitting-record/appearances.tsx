import { PanelButton } from '@/components/add-panel'
import { Row, RowList } from '@/components/operational-row'
import { EmptyNote } from '@/components/planned'
import { Tag } from '@/components/status-tag'
import { messageOf } from '@/lib/api'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import { DrawerFooter } from '@pleadli/ui/drawer'
import { t } from '@pleadli/ui/goey-toaster'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { SubmitButton } from '@/components/submit-button'
import { useAddAppearance, useRemoveAppearance, useSetAttendance, useTakeAppearances } from './queries'
import { appearanceRoleLabel, appearanceRoles, attendanceLabel, attendanceOptions, type Appearance } from './schema'

function AddAppearanceForm({ sittingId, onSuccess }: { sittingId: string; onSuccess: () => void }) {
  const add = useAddAppearance()
  const form = useAppForm({
    defaultValues: { name: '', role: 'witness' },
    validators: { onSubmit: ({ value }) => (value.name.trim() ? undefined : 'Enter a name.') },
    onSubmit: async ({ value }) => {
      try {
        await add.mutateAsync({ sittingId, name: value.name, role: value.role })
        t.success('Added')
        onSuccess()
      } catch (error) {
        t.error('Could not add the person', { description: messageOf(error) })
      }
    },
  })
  return (
    <form
      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="role">{(f) => <f.select label="Role" options={appearanceRoles.map((r) => ({ value: r.id, label: r.label }))} />}</form.AppField>
      <form.AppField name="name">{(f) => <f.input label="Name" />}</form.AppField>
      <DrawerFooter>
        <SubmitButton form={form} label="Add" />
      </DrawerFooter>
    </form>
  )
}

function AppearanceRow({ appearance, editable, custody }: { appearance: Appearance; editable: boolean; custody: string | null }) {
  const set = useSetAttendance()
  const remove = useRemoveAppearance()
  const options = attendanceOptions.filter((o) => o.id !== 'not_produced' || appearance.role === 'accused')
  const notProduced = appearance.attendance === 'not_produced'

  return (
    <Row
      aligned
      marker={notProduced ? 'urgent' : appearance.attendance === 'unrecorded' ? 'open' : undefined}
      title={appearance.name}
      summary={[appearanceRoleLabel(appearance.role), custody, appearance.note].filter(Boolean).join('. ')}
      trailing={
        editable ? (
          <>
            <div className="w-44">
              <Select
                items={options.map((o) => ({ value: o.id, label: o.label }))}
                value={appearance.attendance}
                onValueChange={(value) =>
                  set.mutate({ id: appearance.id, input: { attendance: value ?? 'unrecorded', note: appearance.note } }, { onError: (error) => t.error('Could not record attendance', { description: messageOf(error) }) })
                }
              >
                <SelectTrigger aria-label={`Attendance of ${appearance.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {appearance.partyId == null && (
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(appearance.id, { onError: (error) => t.error('Could not remove', { description: messageOf(error) }) })}>
                Remove
              </Button>
            )}
          </>
        ) : (
          <Tag tone={notProduced ? 'urgent' : appearance.attendance === 'unrecorded' ? 'stopped' : 'neutral'}>{attendanceLabel(appearance.attendance)}</Tag>
        )
      }
    />
  )
}

/** Who was at the sitting. Everyone in the case is listed as not recorded, so
 * presence is written down, never assumed. An accused person in custody can be
 * recorded as not produced, which is what an adjournment for that reason needs. */
export function Appearances({ sittingId, appearances, custodyOf, editable }: { sittingId: string; appearances: readonly Appearance[]; custodyOf: (partyId: string | null) => string | null; editable: boolean }) {
  const take = useTakeAppearances()
  return (
    <section aria-labelledby="appearances" className="page-section">
      <div className="section-head">
        <h2 id="appearances">Appearances</h2>
        {editable && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="secondary" disabled={take.isPending} onClick={() => take.mutate(sittingId, { onError: (error) => t.error('Could not list the people in the case', { description: messageOf(error) }) })}>
              List the case&rsquo;s people
            </Button>
            <PanelButton label="Add" title="Add someone" description="A witness, an interpreter or anyone else who appeared." variant="ghost">
              {({ close }) => <AddAppearanceForm sittingId={sittingId} onSuccess={close} />}
            </PanelButton>
          </div>
        )}
      </div>
      {appearances.length === 0 ? (
        <EmptyNote>No one is listed yet. List the case&rsquo;s people, then record who was there.</EmptyNote>
      ) : (
        <RowList>
          {appearances.map((a) => (
            <AppearanceRow key={a.id} appearance={a} editable={editable} custody={custodyOf(a.partyId)} />
          ))}
        </RowList>
      )}
    </section>
  )
}
