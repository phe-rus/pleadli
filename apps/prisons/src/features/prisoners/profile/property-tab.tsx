import { AttachmentsField, entityTypes } from '@/features/attachments'
import { PropertyRecordForm, ReturnPropertyForm, usePropertyRecordsForPrisoner, type PropertyRecord } from '@/features/property-records'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { Dash, FormDrawer, ItemDrawer, ProfileSection, ProfileTable } from './blocks'
import { m } from '@/paraglide/messages'

export function PropertyTab({ prisonerId }: { prisonerId: string }) {
  const { data: records } = usePropertyRecordsForPrisoner(prisonerId)
  const [returning, setReturning] = useState<PropertyRecord | null>(null)

  return (
    <div className="flex flex-col gap-8">
      <ProfileSection
        title={m.prisoners_property_and_effects()}
        count={records.length}
        action={
          <FormDrawer
            label={m.prisoners_add_property_record()}
            title={m.prisoners_add_property_record()}
            description={m.prisoners_record_belongings_placed_in_the_officer()}
          >
            {(close, setDirty) => <PropertyRecordForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={records}
          getKey={(r) => r.id}
          empty={m.prisoners_no_property_recorded_yet()}
          columns={[
            { header: m.prisoners_description(), className: 'min-w-48', cell: (r) => <span className="font-medium">{r.description}</span> },
            { header: m.prisoners_recorded(), cell: (r) => format(r.recordedAt, 'd MMM yyyy') },
            {
              header: m.prisoners_returned(),
              cell: (r) =>
                r.returnedAt ? (
                  <div className="flex flex-col gap-0.5">
                    <Badge variant="outline" className="w-fit">
                      {format(r.returnedAt, 'd MMM yyyy')}
                    </Badge>
                    {r.returnedNote && <span className="text-xs text-muted-foreground">{r.returnedNote}</span>}
                  </div>
                ) : (
                  <Button size="xs" variant="ghost" onClick={() => setReturning(r)}>
                    {m.prisoners_mark_returned()}
                  </Button>
                ),
            },
            { header: m.prisoners_note(), cell: (r) => (r.returnedAt ? <Dash /> : <span className="text-muted-foreground">{m.prisoners_held()}</span>) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title={m.prisoners_documents()} description={m.prisoners_scans_and_files_attached_to_this()}>
        <AttachmentsField entityType={entityTypes.prisoner} entityId={prisonerId} />
      </ProfileSection>

      <ItemDrawer item={returning} onClose={() => setReturning(null)} title={m.prisoners_mark_property_returned()} description={m.prisoners_record_return_at_release_or_discharge()}>
        {(r, close, setDirty) => <ReturnPropertyForm key={r.id} record={r} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>
    </div>
  )
}
