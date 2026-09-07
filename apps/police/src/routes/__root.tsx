import { SplashScreen } from '@/components/splash-screen'
import { ThemeProvider } from '@/components/theme-provider'
import appCss from '@pleadli/ui/globals.css?url'
import { GooeyToaster } from "@pleadli/ui/goey-toaster"
import { TooltipProvider } from '@pleadli/ui/tooltip'
import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { useState } from 'react'

type RouterAppContext = {
    queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "theme-color", content: "oklch(0.9904 0.0148 94.1935)" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: 'Pleadli' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      }
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-8 pt-20">
      <h1 className="mb-3 text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
    </main>
  ),
  component: RootComponent,
})

function RootComponent() {
  const [ready, setReady] = useState(false)

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      storageKey="pleadli:themer"
      disableTransitionOnChange
    >
      <TooltipProvider>
        {ready ? <Outlet /> : <SplashScreen onDone={() => setReady(true)} />}
        <GooeyToaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}