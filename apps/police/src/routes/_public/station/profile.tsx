import * as m from '@/paraglide/messages'
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
          <h1>{m["profile_page.title"]()}</h1>
          <p className="md:max-w-lg">{m["profile_page.lead"]()}</p>
        </div>

        <Createpanel
          open={editOpen}
          onOpenChange={setEditOpen}
          isDirty={editDirty}
          trigger={
            <Button size="sm" variant="secondary">
              <HugeiconsIcon icon={Edit02Icon} />
              {m["people_page.edit"]()}
            </Button>
          }
          headings={{ title: m["profile_page.edit_title"](), description: m["profile_page.edit_desc"]() }}
        >
          <StationProfileForm onSuccess={() => setEditOpen(false)} onDirtyChange={setEditDirty} />
        </Createpanel>
      </section>

      <div className="grid grid-cols-2 gap-6 md:max-w-lg">
        <Field label={m["command.station_name"]()} value={profile?.name} />
        <Field label={m["station_profile.jurisdiction"]()} value={profile?.jurisdiction} />
        <Field label={m["people.address"]()} value={profile?.address} />
        <Field label={m["station_profile.contact"]()} value={profile?.contact} />
        <Field label={m["station_profile.oc_name"]()} value={profile?.ocStationName} />
        <Field label={m["station_profile.oc_rank"]()} value={profile?.ocStationRank} />
      </div>

      <section aria-labelledby="structure" className="page-section md:max-w-lg">
        <div className="section-head">
          <h2 id="structure">{m["profile_page.structure"]()}</h2>
          <Createpanel
            open={chainOpen}
            onOpenChange={setChainOpen}
            isDirty={chainDirty}
            trigger={
              <Button size="sm" variant="secondary">
                <HugeiconsIcon icon={Edit02Icon} />
                {m["people_page.edit"]()}
              </Button>
            }
            headings={{ title: m["profile_page.structure_title"](), description: m["profile_page.structure_desc"]() }}
          >
            <ChainForm onSuccess={() => setChainOpen(false)} onDirtyChange={setChainDirty} />
          </Createpanel>
        </div>
        {chain.above.length === 0 ? (
          <p className="text-muted-foreground">{m["profile_page.not_recorded"]()}</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {chain.above.map((unit) => (
              <Field key={unit.id} label={unitKindLabel(unit.kind)} value={unit.name} />
            ))}
            <Field label={m["common.station"]()} value={chain.station.name} />
          </div>
        )}
      </section>
    </article>
  )
}
