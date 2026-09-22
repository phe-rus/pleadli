import { officersOptions, useOfficers } from '@/features/officers'
import { stationProfileOptions, useStationProfile } from '@/features/station-admin'
import { Building06Icon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/station/')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query({ ...stationProfileOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...officersOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { data: profile } = useStationProfile()
  const { data: officers } = useOfficers()
  const here = officers.filter((o) => o.active).length

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>Station administration</h1>
          <p>What station this is, and who works here. Not shift scheduling (Duty roster) and not equipment (Armory, Impounded assets).</p>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:max-w-xl">
        <Link to="/station/profile" className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Building06Icon} className="size-4" />
            <h3>Profile</h3>
          </div>
          <p>{profile?.name || 'Not yet configured'}</p>
        </Link>
        <Link to="/station/officers" className="flex flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:bg-muted/60">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={ShieldKeyIcon} className="size-4" />
            <h3>Officers</h3>
          </div>
          <p>{here === 1 ? '1 officer at the station' : `${here} officers at the station`}</p>
        </Link>
      </section>
    </article>
  )
}
