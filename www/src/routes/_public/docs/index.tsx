import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@pleadli/ui/card'
import { ArrowRight02Icon, BookOpen01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">
          <HugeiconsIcon icon={BookOpen01Icon} data-icon="inline-start" />
          Documentation
        </Badge>
        <h1 className="text-3xl!">Pleadli, technically</h1>
        <p>
          This section is for a more technical or institutional-integration reader, not the
          general marketing pitch. It covers the actual model behind Pleadli and where the
          platform stands today.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">What Pleadli is</h2>
        <p>
          Pleadli is a family of purpose-built applications, Pleadli Police, Pleadli DPP, Pleadli
          Courts, Pleadli Lawyers, and Pleadli Prisons, each with its own login, workflows, and
          records. Pleadli Cloud is the platform underneath all of them: identity, organizations,
          access, and the shared case identity that connects legitimate relationships across
          applications.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Current scope</h2>
        <p>
          Pleadli Cloud and the first two applications, Pleadli Police and Pleadli DPP, are being
          built now. Pleadli Courts, Pleadli Lawyers, and Pleadli Prisons are designed but not yet
          built, not queued behind Police and DPP so much as awaiting their own product
          requirements.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>How it works</CardTitle>
            <CardDescription className="text-base!">
              The shared case identity and institution-owned records model, in detail.
            </CardDescription>
          </div>
          <Link
            to="/docs/how-it-works"
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary"
          >
            Read next
            <HugeiconsIcon icon={ArrowRight02Icon} className="size-4!" />
          </Link>
        </CardHeader>
      </Card>
    </div>
  )
}
