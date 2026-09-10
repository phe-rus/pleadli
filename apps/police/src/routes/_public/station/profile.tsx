import { Createpanel } from '@/components/create-panel'
import { stationProfileOptions, StationProfileForm, useStationProfile } from '@/features/station-admin'
import { Edit02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/station/profile')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...stationProfileOptions(), staleTime: 'static' })
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
  const { data: profile } = useStationProfile()

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
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
    </article>
  )
}
