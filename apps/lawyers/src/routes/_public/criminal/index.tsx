import { criminalRegisterOptions } from '@/features/criminal/data'
import { CriminalRegister } from '@/features/criminal/register'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/criminal/')({
  loader: ({ context }) => context.queryClient.query({ ...criminalRegisterOptions(), staleTime: 'static' }),
  component: RouteComponent,
})

/** The criminal register (the client's CTMS Cases module). */
function RouteComponent() {
  return (
    <article className="page">
      <CriminalRegister />
    </article>
  )
}
