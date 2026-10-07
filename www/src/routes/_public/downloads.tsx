import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { getProducts, getReadinessLabel } from '@/data/products'
import { Download01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import * as m from '@/paraglide/messages'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/downloads')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-16 md:py-20">
        <Badge variant="secondary">{m["nav.downloads"]()}</Badge>
        <h1 className="text-2xl md:max-w-2xl md:text-5xl!">{m["downloads.title"]()}</h1>
        <p className="md:max-w-lg md:text-base!">{m["downloads.lead"]()}</p>
      </section>

      <section className="flex flex-col gap-3 pb-10">
        {getProducts().map((product) => (
          <Card key={product.slug} className="gap-0 overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <HugeiconsIcon icon={product.icon} className="size-4!" />
                </div>
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription className="text-sm">{product.download.platforms.join(' · ')}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={product.readiness === 'building' ? 'default' : 'secondary'}>
                  {getReadinessLabel()[product.readiness]}
                </Badge>
                {product.download.release ? (
                  <Button nativeButton={false} render={<a href={product.download.release.url} target="_blank" rel="noreferrer" />}>
                    <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
                    Windows {product.download.release.version}
                  </Button>
                ) : (
                  <Button disabled>
                    <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
                    {m["downloads.not_available"]()}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-start gap-2 border-t border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground sm:px-5">
              <HugeiconsIcon icon={InformationCircleIcon} className="mt-0.5 size-4! shrink-0" />
              {product.download.state}
            </div>
          </Card>
        ))}
      </section>

      <section className="flex flex-col gap-3 border-t border-border/60 py-10">
        <h2 className="text-xl!">{m["downloads.stand_title"]()}</h2>
        <ul className="flex flex-col gap-1.5">
          {[m["downloads.stand.installers"](), m["downloads.stand.updates"](), m["downloads.stand.codesign"](), m["downloads.stand.rest"]()].map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}
