import { isSettingsSection, SettingsShell } from '@/features/settings'
import { prosecutorProfileOptions } from '@/features/prosecutor-profile'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/$section')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...prosecutorProfileOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { section } = Route.useParams()
  return <SettingsShell sectionId={isSettingsSection(section) ? section : 'prosecutor'} />
}
