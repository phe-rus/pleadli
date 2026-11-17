import { RouteError } from '@/features/diagnostics'
import { Queryprovider, queryContext } from '@/lib/query-context'
import "@/routes/styles/globals.css"
import { createRouteDefaults } from '@pleadli/shell'
import { shellConfig } from '@/features/workspace/config'
import { RouterProvider, createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import ReactDOM from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import { startUpdateChecks } from '@/lib/updater'

const routeDefaults = createRouteDefaults(shellConfig)

const getRouter = () => {
    const queryClient = queryContext()
    const router = createTanStackRouter({
        routeTree,
        context: {
            queryClient: queryClient,
        },
        scrollRestoration: true,
        defaultPreload: 'intent',
        defaultPreloadStaleTime: 0,
        defaultPendingComponent: routeDefaults.defaultPendingComponent,
        defaultErrorComponent: RouteError,
        Wrap: ({ children }) => {
            return (
                <Queryprovider query={queryClient}>
                    {children}
                </Queryprovider>
            )
        }
    })
    setupRouterSsrQueryIntegration({
        queryClient: queryClient,
        router,
    })
    return router
}

declare module '@tanstack/react-router' {
    interface Register {
        router: ReturnType<typeof getRouter>
    }
}


const rootElement = document.getElementById("root")

if (!rootElement) {
    throw new Error("Root element not found")
}

if (!rootElement.innerHTML) {
    startUpdateChecks()
    const root = ReactDOM.createRoot(rootElement)
    root.render(
        <RouterProvider
            router={getRouter()}
        />
    )
}