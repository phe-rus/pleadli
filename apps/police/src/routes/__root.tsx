import { Notfound } from '@/components/notfound'
import { SplashScreen } from '@/components/splash-screen'
import { ThemeProvider } from '@/components/theme-provider'
import { WindowResizeHandles } from '@/components/window-resize-handles'
import { forwardErrorsToLog } from '@/lib/forward-errors-to-log'
import tailwindcss from '@pleadli/ui/globals.css?url'
import { GooeyToaster } from "@pleadli/ui/goey-toaster"
import { cn } from '@pleadli/ui/lib/utils'
import { TooltipProvider } from '@pleadli/ui/tooltip'
import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { useEffect } from 'react'

type RouterAppContext = {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: Notfound,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "theme-color", content: "oklch(0.9904 0.0148 94.1935)" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: 'Pleadli' },
    ],
    scripts: [
      { href: tailwindcss, rel: "stylesheet" }
    ]
  })
})

function RootComponent() {
  useEffect(() => {
    forwardErrorsToLog()
  }, [])

  return (
    <>
      <HeadContent />
      <main className={cn(
        "flex flex-col bg-background h-svh transition-colors",
        'rounded-sm shadow-lg! border border-border/25 typeset'
      )}>
        <WindowResizeHandles />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          enableColorScheme
          storageKey="pleadli:themer"
          disableTransitionOnChange
        >
          <div className={cn(
            'relative isolate transition-colors wrap-anywhere',
            'selection:bg-primary/15'
          )}>
            <TooltipProvider>
              <SplashScreen>
                <Outlet />
              </SplashScreen>
            </TooltipProvider>
            <GooeyToaster richColors />
          </div>
        </ThemeProvider>
      </main>
      <Scripts />
    </>
  )
}