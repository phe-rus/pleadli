import { FacilitiesPage, facilitiesOptions } from '@/features/facilities'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/facilities/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...facilitiesOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <FacilitiesPage />
}
