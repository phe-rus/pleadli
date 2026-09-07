import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { DefaultBoundary, NotFound } from '@/components/defaults'
import { Queryprovider, queryContext } from '@/lib/query-context'
import { routeTree } from './routeTree.gen'

export interface RouterAppContext {
  query: QueryClient
}

export function getRouter() {
  const query = queryContext()
  const router = createTanStackRouter({
    routeTree,
    context: {
      query,
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultBoundary,
    defaultNotFoundComponent: () => <NotFound />,
    Wrap: ({ children }) => {
      return <Queryprovider query={query}>{children}</Queryprovider>
    },
  })

  setupRouterSsrQueryIntegration({
    queryClient: query,
    router,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
