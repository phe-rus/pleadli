import { Createpanel } from '@/components/create-panel'
import { stationProfileOptions, StationProfileForm, useStationProfile } from '@/features/station-admin'
import { chainOptions, ChainForm, unitKindLabel, useChain } from '@/features/units'
import { Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/station/profile')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...stationProfileOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...chainOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value || '·'}</p>
    </div>
  )
}

function RouteComponent() {
  const [editOpen, setEditOpen] = useState(false)
  const [editDirty, setEditDirty] = useState(false)
  const [chainOpen, setChainOpen] = useState(false)
  const [chainDirty, setChainDirty] = useState(false)
  const { data: profile } = useStationProfile()
  const { data: chain } = useChain()

  return (
    <article className="page">
      <section className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h1>Station Profile</h1>
          <p className="md:max-w-lg">What station this is. The canonical source PF53 and Overview both read from.</p>
        </div>

        <Createpanel
          open={editOpen}
          onOpenChange={setEditOpen}
          isDirty={editDirty}
          trigger={
            <Button size="sm" variant="secondary">
              <HugeiconsIcon icon={Edit02Icon} />
              Edit
            </Button>
          }
          headings={{ title: 'Edit station profile', description: "Update this station's recorded identity." }}
        >
          <StationProfileForm onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
        </Createpanel>
      </section>

      <div className="grid grid-cols-2 gap-6 md:max-w-lg">
        <Field label="Station name" value={profile?.name} />
        <Field label="Jurisdiction" value={profile?.jurisdiction} />
        <Field label="Address" value={profile?.address} />
        <Field label="Contact / telephone" value={profile?.contact} />
        <Field label="OC Station name" value={profile?.ocStationName} />
        <Field label="OC Station rank" value={profile?.ocStationRank} />
      </div>

      <section aria-labelledby="structure" className="page-section md:max-w-lg">
        <div className="section-head">
          <h2 id="structure">Place in the command structure</h2>
          <Createpanel
            open={chainOpen}
            onOpenChange={setChainOpen}
            isDirty={chainDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={Edit02Icon} />
                Edit
              </Button>
            }
            headings={{ title: 'Command structure', description: 'The region, district and division this station sits in.' }}
          >
            <ChainForm onSuccess={() => setChainOpen(false)} onDirtyChange={setChainDirty} />
          </Createpanel>
        </div>
        {chain.above.length === 0 ? (
          <p className="text-muted-foreground">Not recorded. Add the region and district so this station can be placed in the structure.</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {chain.above.map((unit) => (
              <Field key={unit.id} label={unitKindLabel(unit.kind)} value={unit.name} />
            ))}
            <Field label="Station" value={chain.station.name} />
          </div>
        )}
      </section>
    </article>
  )
}
