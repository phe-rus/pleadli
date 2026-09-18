import { TransferBoard, transfersOptions } from '@/features/transfers'
import { buttonVariants } from '@pleadli/ui/button'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/movements/')({
  loader: async ({ context }) => {
    await context.queryClient.query({ ...transfersOptions(), staleTime: 'static' })
  },
  component: RouteComponent,
})

/**
 * Movements (docs/prisons/product-map/08 1.1): every crossing of the custody
 * boundary that is still in flight. Reception and receiving a transfer start
 * here; a transfer out starts from the person's file.
 */
function RouteComponent() {
  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1>Movements</h1>
          <p className="md:max-w-md">Transfers in and out, from order to confirmation.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
            Reception
          </Link>
          <Link to="/procedures/receive" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            Receive a transfer
          </Link>
        </div>
      </section>
      <TransferBoard />
    </article>
  )
}
