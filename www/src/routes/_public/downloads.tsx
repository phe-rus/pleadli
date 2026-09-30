import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { products, readinessLabel } from '@/data/products'
import { Download01Icon, InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/downloads')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <article className="container flex w-full flex-col gap-5 md:max-w-5xl">
      <section className="flex flex-col gap-5 py-16 md:py-20">
        <Badge variant="secondary">Downloads</Badge>
        <h1 className="text-2xl md:max-w-2xl md:text-5xl!">Not yet publicly distributed.</h1>
        <p className="md:max-w-lg md:text-base!">
          Every Pleadli desktop application is used in active development and testing today, none
          are packaged for public download yet. This page will carry real installers, checksums,
          and release notes once a signed release pipeline exists. Until then, it shows exactly
          where each application stands.
        </p>
      </section>

      <section className="flex flex-col gap-3 pb-10">
        {products.map((product) => (
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
                  {readinessLabel[product.readiness]}
                </Badge>
                <Button disabled>
                  <HugeiconsIcon icon={Download01Icon} data-icon="inline-start" />
                  Not available
                </Button>
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
        <h2 className="text-xl!">What has to exist first</h2>
        <ul className="flex flex-col gap-1.5">
          {[
            'A signed, authenticated release and asset pipeline, not an open upload endpoint.',
            'Platform detection and installers for Windows and Linux.',
            'An in-app update check with release notes, not a manual re-download.',
            'Checksums published alongside every installer.',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </section>
    </article>
  )
}
