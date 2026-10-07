import { createFileRoute } from '@tanstack/react-router'
import { handleOrchestraV1 } from '@/api/orchestra-v1'

export const Route = createFileRoute('/api/orchestra/v1/$')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleOrchestraV1(request, params._splat ?? ''),
      POST: ({ request, params }) => handleOrchestraV1(request, params._splat ?? ''),
    },
  },
})
