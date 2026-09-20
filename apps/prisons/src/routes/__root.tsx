import { Notfound } from '@/components/notfound'
import { SplashScreen } from '@/components/splash-screen'
import { ThemeProvider } from '@/components/theme-provider'
import { WindowResizeHandles } from '@/components/window-resize-handles'
import { AppErrorBoundary, ErrorOverlay, watchWindowErrors } from '@/features/diagnostics'
import { LocaleBoundary } from '@/features/i18n'
import { NodeUnreachableBanner, RecoveryGate } from '@/features/node'
import { OnboardingGate } from '@/features/onboarding'
import { SignInGate } from '@/features/session'
import { forwardErrorsToLog } from '@/lib/forward-errors-to-log'
import tailwindcss from '@/routes/styles/globals.css?url'
import { GooeyToaster } from "@pleadli/ui/goey-toaster"
import { cn } from '@pleadli/ui/lib/utils'
import { TooltipProvider } from '@pleadli/ui/tooltip'
import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { MotionConfig } from 'framer-motion'
import { useEffect } from 'react'
import { m } from '@/paraglide/messages'

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
      { title: m.route_app_pleadli_prisons() },
    ],
    scripts: [
      { href: tailwindcss, rel: "stylesheet" }
    ]
  })
})

function RootComponent() {
  useEffect(() => {
    forwardErrorsToLog()
    return watchWindowErrors()
  }, [])

  return (
    <>
      <HeadContent />
      <main className={cn(
        "flex flex-col bg-background h-svh transition-colors overflow-hidden!",
        'rounded-md! shadow-lg! border border-border/35 typeset',
        'print:h-auto print:overflow-visible print:rounded-none',
        'print:border-none print:shadow-none'
      )}>
        <WindowResizeHandles />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          enableColorScheme
          storageKey="pleadli:prisons"
          disableTransitionOnChange
        >
          <div className={cn(
            'relative isolate transition-colors wrap-anywhere',
            'selection:bg-primary/15'
          )}>
            <MotionConfig reducedMotion="user">
              <TooltipProvider>
                <SplashScreen>
                  <LocaleBoundary>
                    <AppErrorBoundary>
                    <RecoveryGate>
                      <OnboardingGate>
                        <SignInGate>
                          <NodeUnreachableBanner />
                          <Outlet />
                        </SignInGate>
                      </OnboardingGate>
                    </RecoveryGate>
                    </AppErrorBoundary>
                  </LocaleBoundary>
                </SplashScreen>
              </TooltipProvider>
            </MotionConfig>
            <GooeyToaster richColors />
            <ErrorOverlay />
          </div>
        </ThemeProvider>
      </main>
      <Scripts />
    </>
  )
}
