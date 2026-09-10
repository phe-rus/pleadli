/** A search result's `route` is a plain pathname, optionally with a query
 * string (e.g. `/incidents?open=<id>`) — computed once in Rust across
 * every domain, so it isn't a statically-known literal route pattern
 * TanStack Router's types can check at compile time. Splitting it here
 * and navigating with an explicit cast is the one deliberate type escape
 * for this genuinely dynamic case, shared by the Search page and the
 * Command menu so they never parse a route differently. */
export function parseSearchRoute(route: string) {
  const [pathname, queryString] = route.split('?')
  const search: Record<string, string> = {}
  for (const pair of queryString?.split('&') ?? []) {
    const [key, value] = pair.split('=')
    if (key) search[decodeURIComponent(key)] = decodeURIComponent(value ?? '')
  }
  return { to: pathname, search }
}
