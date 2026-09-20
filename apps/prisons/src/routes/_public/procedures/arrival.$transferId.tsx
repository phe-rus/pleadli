import { ArrivalPage } from '@/features/procedures'
import { dossierPreviewOptions, transfersOptions } from '@/features/transfers'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/procedures/arrival/$transferId')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query({ ...dossierPreviewOptions(params.transferId), staleTime: 'static' }),
      context.queryClient.query({ ...transfersOptions(), staleTime: 'static' }),
    ])
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { transferId } = Route.useParams()
  return <ArrivalPage transferId={transferId} />
}
