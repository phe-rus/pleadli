import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import appCss from '@/styles/globals.css?url'
import { cn } from '@/lib/utils'
import { ThemeProvider } from '@/components/theme-provider'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "theme-color", content: "var(--bg-background)" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: 'Pleadli' },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-8 pt-20">
      <h1 className="mb-3 text-3xl font-bold">Page not found</h1>
      <p className="text-muted-foreground">The page you're looking for doesn't exist.</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={cn(
        "relative isolate bg-background transition-colors",
        "wrap-anywhere selection:bg-primary/15"
      )}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          enableColorScheme
          storageKey="pleadli:themer"
          disableTransitionOnChange
        >
          <Outlet />
        </ThemeProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
