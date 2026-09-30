import { Loaders } from '@/components/loaders'
import { ThemeProvider } from '@/components/theme-provider'
import { AppGate } from '@/features/app-gate'
import { LanguageSelect, LocaleBoundary } from '@/features/i18n'
import { RecoveryGate } from '@/features/system'
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
    // The gates sit outside the router, so data that could not be opened,
    // first-launch setup and sign-in are decided before any route loads. The
    // language selector sits outside them too: it is there from the first screen.
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
                    <AppGate onUnlocked={() => void router.invalidate()}>
                        <LocaleBoundary>
                            <RouterProvider router={router} />
                        </LocaleBoundary>
                    </AppGate>
                    <LanguageSelect />
                </RecoveryGate>
            </Queryprovider>
        </ThemeProvider>
    )
}
