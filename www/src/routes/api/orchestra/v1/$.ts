import { createFileRoute } from '@tanstack/react-router'
import { handleOrchestraV1 } from '@/api/orchestra-v1'
import { handleRelayV1 } from '@/api/relay-v1'
import { handleTunnelV1 } from '@/api/tunnel-v1'

/** /api/orchestra/v1/relay/* is the postbox relay (docs/platform/RELAY-DESIGN.md);
 * everything else is the licence and papers API (ORCHESTRA-API.md). */
const route = (request: Request, splat: string) =>
  splat === 'tunnel' ? handleTunnelV1(request) : splat.startsWith('relay/') ? handleRelayV1(request, splat.slice('relay/'.length)) : handleOrchestraV1(request, splat)

export const Route = createFileRoute('/api/orchestra/v1/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => route(request, params._splat ?? ''),
      POST: ({ request, params }) => route(request, params._splat ?? ''),
      PUT: ({ request, params }) => route(request, params._splat ?? ''),
    },
  },
})
