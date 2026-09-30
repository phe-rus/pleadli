import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { products, readinessLabel } from '@/data/products'
import { ArrowRight02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/applications')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">Applications</Badge>
        <h1 className="text-3xl!">A family of purpose-built applications</h1>
        <p>
          Pleadli Police, Pleadli DPP, Pleadli Courts, Pleadli Lawyers, and Pleadli Prisons are
          separate applications, each designed around the work its users actually do. They are
          connected by Pleadli Cloud and by the cases they legitimately share, not merged into one
          product. See{' '}
          <Link to="/products" className="font-medium text-foreground underline underline-offset-2">
            the full products section
          </Link>{' '}
          for a deep page per application.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {products.map((product) => (
          <Link key={product.slug} to="/products/$slug" params={{ slug: product.slug }} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader className="gap-3">
                <div className="flex items-center justify-between">
                  <div
                    className={
                      product.readiness === 'building'
                        ? 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'
                        : 'flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
                    }
                  >
                    <HugeiconsIcon icon={product.icon} />
                  </div>
                  <Badge variant={product.readiness === 'building' ? 'default' : 'secondary'}>
                    {readinessLabel[product.readiness]}
                  </Badge>
                </div>
                <div>
                  <CardTitle>{product.name}</CardTitle>
                  <CardDescription className="text-base!">{product.tagline}</CardDescription>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read more
                  <HugeiconsIcon icon={ArrowRight02Icon} className="size-3.5!" />
                </span>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Independently useful</h2>
        <p>
          Each application provides value on its own. A police station can use Pleadli Police to
          manage its own work whether or not a given case has reached the DPP. An individual
          lawyer can use Pleadli Lawyers for their own practice with no court connection at all.
          Interoperability becomes valuable when a legitimate relationship exists, it isn't a
          requirement for an application to be useful.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Why Police and DPP first</h2>
        <p>
          Police and DPP sit next to each other in a case's early life, investigation and
          prosecution, which makes the shared-identity, institution-owned-records model testable
          end to end without needing every application built first. This is a practical starting
          point, not a sequence the other applications are waiting in line behind, and it is why
          they carry the deepest security and document work today.
        </p>
      </div>
    </div>
  )
}
