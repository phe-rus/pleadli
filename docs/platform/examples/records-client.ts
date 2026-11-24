/**
 * A typed client for the Pleadli records API (docs/platform/RECORDS-API.md).
 * Self-contained: copy this file. It needs only `fetch`, so it runs in a browser, Bun, Node 18+ or a Worker.
 *
 * The server decides what you may see. This client cannot ask for more, and a field you are not allowed
 * is simply absent from the response, not hidden by the client.
 */

export type Audience = 'public' | 'application' | 'lawyer' | 'party' | 'institution'
export type RecordStatus = 'published' | 'withdrawn' | 'corrected' | 'superseded' | 'sealed'

export interface RecordQuery {
  /** Two-letter country code of the issuing institution: "UG". Required: a number alone does not identify a record. */
  jurisdiction: string
  /** The kind of reference: "crb", "court_file", "dpp_file", ... Required. */
  kind: string
  /** The reference as written ("CRB 123/2026") or any common spelling ("crb-123-2026"). */
  reference: string
  /** Narrow to one record type, e.g. "criminal_case". */
  type?: string
  /** Narrow to one issuing office by its Pleadli address, e.g. "ug.police.gulu". */
  institution?: string
}

export interface DisclosedRecord {
  institution: string
  jurisdiction: string
  recordType: string
  referenceKind: string
  reference: string
  status: RecordStatus
  statusNote: string | null
  /** Set when status is "superseded": the reference of the record that replaced this one. */
  supersededByReference: string | null
  /** The most trusted level you hold for THIS record, and every level you hold. */
  audience: Audience
  audiences: Audience[]
  /** Only fields the issuing institution allows YOU to see. */
  fields: Record<string, string | number | boolean | null>
  freshness: {
    /** When the institution last changed the record at its own end (ms since epoch). */
    sourceUpdatedAt: number
    /** When Pleadli received this projection. */
    projectedAt: number
    ageHours: number
    /** True when the source is more than seven days old: ask the institution before relying on it. */
    stale: boolean
  }
  /** A projection of the institution's record. The institution's own register stays authoritative. */
  authority: 'institution_projection'
}

export interface RecordsResponse {
  results: DisclosedRecord[]
  count: number
}

export class RecordsError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** For 429 and 503: seconds to wait before asking again. */
    public retryAfter?: number,
  ) {
    super(`${status} ${code}`)
  }
}

export class PleadliRecords {
  constructor(
    private secret: string,
    private base = 'https://pleadli.com',
  ) {}

  /** Look up a record. An empty `results` means "nothing you may see": it does not say whether a record exists. */
  async lookup(query: RecordQuery, signal?: AbortSignal): Promise<RecordsResponse> {
    const url = new URL('/api/records/v1/records', this.base)
    for (const [key, value] of Object.entries(query)) if (value) url.searchParams.set(key, value)
    const response = await fetch(url, { headers: { authorization: `Bearer ${this.secret}` }, signal })
    const body = (await response.json().catch(() => ({}))) as { error?: string; retryAfter?: number }
    if (response.status === 429) throw new RecordsError(429, 'too_many_requests', body.retryAfter ?? Number(response.headers.get('retry-after') ?? 60))
    // 503: the service could not check your quota, so it refused rather than answer unmetered. Nothing was read. Retry later.
    if (response.status === 503) throw new RecordsError(503, 'service_unavailable', body.retryAfter ?? Number(response.headers.get('retry-after') ?? 5))
    if (!response.ok) throw new RecordsError(response.status, body.error ?? 'error')
    return body as unknown as RecordsResponse
  }

  /** Same, but waits out one 429 (up to `maxWaitSeconds`) before giving up. */
  async lookupPatiently(query: RecordQuery, maxWaitSeconds = 30): Promise<RecordsResponse> {
    try {
      return await this.lookup(query)
    } catch (error) {
      if (error instanceof RecordsError && error.status === 429 && (error.retryAfter ?? 60) <= maxWaitSeconds) {
        await new Promise((resolve) => setTimeout(resolve, (error.retryAfter ?? 1) * 1000))
        return this.lookup(query)
      }
      throw error
    }
  }
}

/** Example: what a Lawyers extension might show. */
export async function describeCase(client: PleadliRecords, crb: string) {
  const { results } = await client.lookup({ jurisdiction: 'UG', kind: 'crb', reference: crb })
  if (!results.length) return 'Nothing is available to you under that reference. Ask the institution.'
  return results
    .map((r) => {
      const note = r.status === 'superseded' ? ` (replaced by ${r.supersededByReference})` : r.status === 'withdrawn' ? ' (withdrawn)' : ''
      const age = r.freshness.stale ? ` - may be out of date, last changed ${r.freshness.ageHours} hours before it was sent` : ''
      return `${r.institution}: ${r.reference}${note}${age}\n${Object.entries(r.fields).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
    })
    .join('\n\n')
}
