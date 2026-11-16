import { facilityProfileOptions } from '@/features/facility'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { m } from '@/paraglide/messages'
import { jurisdictionPack } from './index'

/** A quiet way to see which law governs the dates, without changing the case. */
export function JurisdictionContext() {
  const query = useQuery({ ...facilityProfileOptions(), retry: false })
  if (query.isPending) return <p className="text-xs text-muted-foreground">{m.jurisdiction_loading()}</p>
  if (query.isError) return <p role="alert" className="text-xs text-destructive">{m.jurisdiction_unavailable()}</p>
  const pack = jurisdictionPack(query.data.jurisdiction)
  return <Link to="/settings/$section" params={{ section: 'jurisdiction' }} className="w-fit text-xs text-muted-foreground underline decoration-transparent underline-offset-4 hover:text-foreground hover:decoration-border">{m.jurisdiction_context({ country: pack.name })}</Link>
}
