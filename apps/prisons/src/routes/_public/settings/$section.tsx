import { SettingsShell, preloadSettings } from '@/features/settings'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/$section')({
  loader: ({ context }) => preloadSettings(context.queryClient),
  component: RouteComponent,
})

function RouteComponent() {
  const { section } = Route.useParams()
  return <SettingsShell sectionId={section} />
}
