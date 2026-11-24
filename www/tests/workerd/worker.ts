import { QuotaCounter } from '../../src/lib/quota-counter'

export { QuotaCounter }

/** GET /hit?bucket=<name>&limit=<n>&window=<ms> asks the real Durable Object for one count, the way quota.server.ts does. */
export default {
  async fetch(request: Request, env: { QUOTA: DurableObjectNamespace<QuotaCounter> }) {
    const url = new URL(request.url)
    const bucket = url.searchParams.get('bucket') ?? 'none'
    const stub = env.QUOTA.get(env.QUOTA.idFromName(bucket))
    return Response.json(await stub.hit(Number(url.searchParams.get('limit') ?? 5), Number(url.searchParams.get('window') ?? 60_000)))
  },
}
