import { Loaders } from '@/components/loaders'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageSelect, LocaleBoundary } from '@/features/i18n'
import { SessionGate } from '@/features/session'
import { Queryprovider, queryContext } from '@/lib/query-context'
import "@/styles/globals.css"
import { RouterProvider, createRouter as createTanStackRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import ReactDOM from 'react-dom/client'
import { routeTree } from './routeTree.gen'
import { startUpdateChecks } from '@/lib/updater'

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
    startUpdateChecks()
    const root = ReactDOM.createRoot(rootElement)
    const router = getRouter()
    // The gate stands outside the router, so first-launch setup or a missing
    // sign-in is decided before any route loads and its loaders are refused.
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
                {/* The language wraps the gate as well as the router, so the
                    first-launch setup and the sign-in screen change language
                    too, and the switcher is there from the very first screen. */}
                <LocaleBoundary>
                    <SessionGate onChange={() => void router.invalidate()}>
                        <RouterProvider router={router} />
                    </SessionGate>
                </LocaleBoundary>
                <LanguageSelect />
            </Queryprovider>
        </ThemeProvider>
    )
}
