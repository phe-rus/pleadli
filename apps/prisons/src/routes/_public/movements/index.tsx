import { TransferBoard, transfersOptions } from '@/features/transfers'
import { buttonVariants } from '@pleadli/ui/button'
import { createFileRoute, Link } from '@tanstack/react-router'
import { m } from '@/paraglide/messages'

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
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_movements_movements()}</h1>
          <p className="md:max-w-md">{m.route_movements_transfers_in_and_out_from_order()}</p>
        </div>
        <div className="page-actions">
          <Link to="/procedures/reception" className={buttonVariants({ size: 'sm' })}>
            {m.route_movements_reception()}
          </Link>
          <Link to="/procedures/receive" className={buttonVariants({ size: 'sm', variant: 'secondary' })}>
            {m.route_movements_receive_a_transfer()}
          </Link>
        </div>
      </header>
      <TransferBoard />
    </article>
  )
}
