import { isSettingsSection, SettingsShell } from '@/features/settings'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/$section')({
  component: RouteComponent,
})

function RouteComponent() {
  const { section } = Route.useParams()
  return <SettingsShell sectionId={isSettingsSection(section) ? section : 'you'} />
}
