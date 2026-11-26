import { isRegister, RegisterPage } from '@/features/registry'
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/registry/$register')({
  beforeLoad: ({ params }) => {
    if (!isRegister(params.register)) throw redirect({ to: '/registry' })
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { register } = Route.useParams()
  return isRegister(register) ? <RegisterPage register={register} /> : null
}
