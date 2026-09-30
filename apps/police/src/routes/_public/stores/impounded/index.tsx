import * as m from '@/paraglide/messages'
import { stationAssetsOptions, StationAssetsPage } from '@/features/station-assets'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/stores/impounded/')({
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
      category="impounded"
      title={m["stores.impounded"]()}
      description={m["stores.impounded_desc"]()}
      addLabel={m["stores.impounded_add"]()}
    />
  )
}
