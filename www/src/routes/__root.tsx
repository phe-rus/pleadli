import { ThemeProvider } from '@/components/theme-provider'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'
import type { RouterAppContext } from '@/router'
import appCss from '@pleadli/ui/globals.css?url'
import { GooeyToaster } from "@pleadli/ui/goey-toaster"
import { cn } from '@pleadli/ui/lib/utils'
import { TooltipProvider } from '@pleadli/ui/tooltip'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

const ogLocale: Record<string, string> = { en: 'en_UG', sw: 'sw_UG', fr: 'fr_FR'}
const SITE = 'https://pleadli.com'

/** What search engines read about Pleadli: the organization and its five
 * applications, in plain structured data. */
const structuredData = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'Pleadli', url: SITE, logo: `${SITE}/apple-touch-icon.png`, slogan: 'Legal Orchestra', areaServed: ['Uganda', 'Kenya', 'Tanzania', 'Rwanda', 'Burundi', 'Democratic Republic of the Congo'] },
    { '@type': 'WebSite', '@id': `${SITE}/#site`, url: SITE, name: 'Pleadli Legal Orchestra', publisher: { '@id': `${SITE}/#org` }, inLanguage: ['en', 'sw', 'fr'] },
    ...[
      ['Pleadli Police', 'police'],
      ['Pleadli DPP', 'dpp'],
      ['Pleadli Courts', 'courts'],
      ['Pleadli Lawyers', 'lawyers'],
      ['Pleadli Prisons', 'prisons'],
    ].map(([name, slug]) => ({ '@type': 'SoftwareApplication', name, url: `${SITE}/products/${slug}`, applicationCategory: 'BusinessApplication', operatingSystem: 'Windows', publisher: { '@id': `${SITE}/#org` } })),
  ],
})

export const Route = createRootRouteWithContext<RouterAppContext>()({
  head: () => {
    const defaultTitle = m["site.title"]()
    const defaultDescription = m["site.description"]()
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "theme-color", content: "#fffcf1" },
      { name: 'application-name', content: 'Pleadli' },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: defaultTitle },
      { name: 'description', content: defaultDescription },
      { name: 'robots', content: 'index, follow' },
      // Open Graph
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Pleadli' },
      { property: 'og:title', content: defaultTitle },
      { property: 'og:description', content: defaultDescription },
      { property: 'og:locale', content: ogLocale[getLocale()] ?? 'en_UG' },
      { property: 'og:url', content: SITE },
      { property: 'og:image', content: `${SITE}/og-image.png` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: defaultTitle },
      // Twitter
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: defaultTitle },
      { name: 'twitter:description', content: defaultDescription },
      { name: 'twitter:image', content: `${SITE}/og-image.png` },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.png', type: 'image/png' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
    ],
    scripts: [{ type: 'application/ld+json', children: structuredData }],
  }
  },
  notFoundComponent: () => (
    <main className="container mx-auto p-8 pt-20">
      <h1 className="mb-3 text-3xl font-bold">{m["site.not_found"]()}</h1>
      <p className="text-muted-foreground">{m["site.not_found_body"]()}</p>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument() {
  return (
    <html lang={getLocale()} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className={cn(
        "relative isolate bg-background transition-colors",
        "wrap-anywhere selection:bg-primary/15 typeset"
      )}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          enableColorScheme
          storageKey="pleadli:themer"
          disableTransitionOnChange
        >
          <TooltipProvider>
            <Outlet />
            <GooeyToaster />
          </TooltipProvider>
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
