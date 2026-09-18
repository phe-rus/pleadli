import { ReceptionProcedure } from '@/features/reception'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/procedures/reception')({
  component: ReceptionProcedure,
})
