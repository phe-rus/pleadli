import { AttachmentsField, entityTypes } from '@/features/attachments'
import { PropertyRecordForm, ReturnPropertyForm, usePropertyRecordsForPrisoner, type PropertyRecord } from '@/features/property-records'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { format } from 'date-fns/format'
import { useState } from 'react'
import { Dash, FormDrawer, ItemDrawer, ProfileSection, ProfileTable } from './blocks'

export function PropertyTab({ prisonerId }: { prisonerId: string }) {
  const { data: records } = usePropertyRecordsForPrisoner(prisonerId)
  const [returning, setReturning] = useState<PropertyRecord | null>(null)

  return (
    <div className="flex flex-col gap-8">
      <ProfileSection
        title="Property and effects"
        count={records.length}
        action={
          <FormDrawer
            label="Add property record"
            title="Add property record"
            description="Record belongings placed in the officer in charge's custody (s.62)."
          >
            {(close, setDirty) => <PropertyRecordForm prisonerId={prisonerId} onSuccess={close} onDirtyChange={setDirty} />}
          </FormDrawer>
        }
      >
        <ProfileTable
          rows={records}
          getKey={(r) => r.id}
          empty="No property recorded yet."
          columns={[
            { header: 'Description', className: 'min-w-48', cell: (r) => <span className="font-medium">{r.description}</span> },
            { header: 'Recorded', cell: (r) => format(r.recordedAt, 'd MMM yyyy') },
            {
              header: 'Returned',
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
                    Mark returned
                  </Button>
                ),
            },
            { header: 'Note', cell: (r) => (r.returnedAt ? <Dash /> : <span className="text-muted-foreground">Held</span>) },
          ]}
        />
      </ProfileSection>

      <ProfileSection title="Documents" description="Scans and files attached to this person's record.">
        <AttachmentsField entityType={entityTypes.prisoner} entityId={prisonerId} />
      </ProfileSection>

      <ItemDrawer item={returning} onClose={() => setReturning(null)} title="Mark property returned" description="Record return at release or discharge (s.62(3)).">
        {(r, close, setDirty) => <ReturnPropertyForm key={r.id} record={r} onSuccess={close} onDirtyChange={setDirty} />}
      </ItemDrawer>
    </div>
  )
}
