import { SplashScreen } from '@/components/splash-screen'
import { ThemeProvider } from '@/components/theme-provider'
import { WindowResizeHandles } from '@/components/window-resize-handles'
import '@pleadli/ui/globals.css?url'
import { GooeyToaster } from "@pleadli/ui/goey-toaster"
import { cn } from '@pleadli/ui/lib/utils'
import { TooltipProvider } from '@pleadli/ui/tooltip'
import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'

type RouterAppContext = {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  notFoundComponent: () => (
    <main className="container mx-auto p-8 pt-20">
      <h1 className="mb-3 text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
    </main>
  ),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "theme-color", content: "oklch(0.9904 0.0148 94.1935)" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: 'Pleadli' },
    ]
  })
})

function RootComponent() {
  return (
    <>
      <HeadContent />
      <main className={cn(
        'relative isolate bg-background transition-colors',
        'wrap-anywhere selection:bg-primary/15 typeset'
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
          <TooltipProvider>
            <SplashScreen>
              <Outlet />
            </SplashScreen>
          </TooltipProvider>
          <GooeyToaster richColors />
        </ThemeProvider>
      </main>
      <Scripts />
    </>
  )
}