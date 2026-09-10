import { stationAssetsOptions, StationAssetsPage } from '@/features/station-assets'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/stores/armory/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    typeof search.open === 'string' ? { open: search.open } : {},
  loader: async ({ context }) => {
    await context.queryClient.query({ ...stationAssetsOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <StationAssetsPage
      category="armory"
      title="Armory Register"
      description="Weapons and equipment held by the station."
      addLabel="Add armory item"
    />
  )
}
