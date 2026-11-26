import { RegisterPage } from '@/features/registry'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/registry/')({
  component: () => <RegisterPage register="incoming" />,
})
