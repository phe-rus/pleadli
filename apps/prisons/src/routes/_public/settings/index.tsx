import { SettingsShell, preloadSettings } from '@/features/settings'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/settings/')({
  loader: ({ context }) => preloadSettings(context.queryClient),
  component: () => <SettingsShell />,
})
