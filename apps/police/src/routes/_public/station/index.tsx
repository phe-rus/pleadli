import { officersOptions, useOfficers } from '@/features/officers'
import { establishmentOptions, stationProfileOptions, useEstablishment, useStationProfile } from '@/features/station-admin'
import { Building06Icon, ShieldKeyIcon, UserGroupIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/station/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...stationProfileOptions(), staleTime: 'static' })
    await context.queryClient.query({ ...establishmentOptions(''), staleTime: 'static' })
    await context.queryClient.query({ ...officersOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { data: profile } = useStationProfile()
  const { data: establishment } = useEstablishment('')
  const { data: officers } = useOfficers()
  const activeCount = establishment.filter((m) => m.active).length

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex flex-col">
        <h1>Station Admin</h1>
        <p className="md:max-w-lg">
          What station is this, and who is currently posted here. Not shift scheduling (Duty Roster) and not
          equipment (Stores &amp; Armory).
        </p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:max-w-xl md:grid-cols-3">
        <Link
          to="/station/profile"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Building06Icon} className="size-4" />
            <h3 className="text-sm">Profile</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {profile?.name || 'Not yet configured'}
          </p>
        </Link>
        <Link
          to="/station/establishment"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={UserGroupIcon} className="size-4" />
            <h3 className="text-sm">Establishment</h3>
          </div>
          <p className="text-xs text-muted-foreground">{activeCount} currently posted</p>
        </Link>
        <Link
          to="/station/officers"
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ShieldKeyIcon} className="size-4" />
            <h3 className="text-sm">Officers</h3>
          </div>
          <p className="text-xs text-muted-foreground">{officers.length} with login credentials</p>
        </Link>
      </section>
    </article>
  )
}
