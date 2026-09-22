import { Loaders } from '@/components/loaders'
import { ThemeProvider } from '@/components/theme-provider'
import { RecoveryGate } from '@/features/system'
import { Queryprovider, queryContext } from '@/lib/query-context'
import "@/styles/globals.css"
import { RouterProvider, createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import ReactDOM from 'react-dom/client'
import { routeTree } from './routeTree.gen'

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
        defaultPendingComponent: () => <Loaders />,
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
    const root = ReactDOM.createRoot(rootElement)
    const router = getRouter()
    // The gate sits outside the router, so data that could not be opened is
    // decided before any route loads and its loaders fail.
    root.render(
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            enableColorScheme
            storageKey="pleadli:themer"
            disableTransitionOnChange
        >
            <Queryprovider query={queryContext()}>
                <RecoveryGate>
                    <RouterProvider router={router} />
                </RecoveryGate>
            </Queryprovider>
        </ThemeProvider>
    )
}
