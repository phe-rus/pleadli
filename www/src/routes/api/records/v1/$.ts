import { handleRecordsV1 } from '@/lib/records.server'
import { createFileRoute } from '@tanstack/react-router'

/** The institution-controlled records API. Authenticated callers only; the anonymous
 * verify and track lookups stay at /api/public/v1. docs/platform/RECORDS-API.md */
const run = ({ request, params }: { request: Request; params: { _splat?: string } }) => handleRecordsV1(request, params._splat ?? '')

export const Route = createFileRoute('/api/records/v1/$')({
  server: { handlers: { GET: run, OPTIONS: run, POST: run, PUT: run, DELETE: run } },
})
