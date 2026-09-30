import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { products } from '@/data/products'
import {
  CheckmarkCircle02Icon,
  CircleIcon,
  Database02Icon,
  FingerPrintIcon,
  FolderLockIcon,
  Key01Icon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'

export const Route = createFileRoute('/_public/docs/security')({
  component: RouteComponent,
})

const shared = [
  {
    icon: Database02Icon,
    title: 'SQLCipher, not plain SQLite',
    description: 'The local database itself is encrypted at rest, not just individual fields inside it.',
  },
  {
    icon: FolderLockIcon,
    title: 'A sealed document vault',
    description: 'Attachments and issued documents are content-addressed and sealed, not stored as loose files on disk.',
  },
  {
    icon: Key01Icon,
    title: 'An OS-keystore key',
    description: "The key that unlocks a machine's database lives in that operating system's own keystore, not in a config file or the database itself.",
  },
  {
    icon: FingerPrintIcon,
    title: 'A hash-chained audit log',
    description: 'Every sensitive action is appended to a log where each entry is chained to the one before it, so a gap or a rewrite is detectable.',
  },
] as const

function StatusIcon({ state }: { state: true | false | 'partial' }) {
  const icon = state === true ? CheckmarkCircle02Icon : state === 'partial' ? MinusSignCircleIcon : CircleIcon
  return (
    <HugeiconsIcon
      icon={icon}
      className={cn(
        'size-4! shrink-0',
        state === true && 'text-primary',
        state === 'partial' && 'text-muted-foreground',
        state === false && 'text-muted-foreground/50',
      )}
    />
  )
}

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">Security</Badge>
        <h1 className="text-3xl!">Security is architecture, not a checkbox</h1>
        <p>
          Justice-sector records carry real consequences: a leaked statement, an altered custody
          record, or an unverifiable court order isn't a data-quality problem, it's a rights
          problem. Where this model is built, it's built into the database and the vault, not
          added afterward as a permissions flag.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {shared.map((item) => (
          <Card key={item.title} className="p-4">
            <HugeiconsIcon icon={item.icon} className="mb-2 text-muted-foreground" />
            <CardTitle>{item.title}</CardTitle>
            <CardDescription className="text-sm">{item.description}</CardDescription>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl!">Where this actually stands, per application</h2>
        <p className="text-muted-foreground">
          Four of five applications share this model today through <code>packages/node-core</code>.
          Police is the one exception, and closing that gap is the next planned security stage.
        </p>
        <div className="flex flex-col gap-2">
          {products.map((product) => (
            <Link
              key={product.slug}
              to="/products/$slug"
              params={{ slug: product.slug }}
              className="flex items-start gap-3 rounded-lg border p-3 hover:border-primary/40"
            >
              <StatusIcon state={product.security.state} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{product.name}</span>
                <span className="text-sm text-muted-foreground">{product.security.detail}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">What's still genuinely open</h2>
        <ul className="flex flex-col gap-1.5">
          {[
            "Police isn't on the encrypted-database model yet, everything the other four applications already have.",
            'Lawyers has no app lock, OS authentication, or per-matter access control, the specific privacy controls a practice handling privileged material needs most.',
            'No application yet distinguishes roles within itself (a judicial officer from a court clerk, for example); anyone with the application installed has full access today.',
            'Facility-to-facility and cross-institution exchange (Prisons’ pinned-TLS peer sync, the Police↔DPP interchange) has been tested on one machine or in a single test run, never yet between two separately packaged machines in the field.',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">Offline by default</h2>
        <p>
          Every Pleadli application is designed to be fully useful with no internet connection at
          all. Cloud services and cross-institution exchange supplement local work; they are never
          a requirement for a station, prosecutor, court, advocate, or facility to keep working.
        </p>
      </div>
    </div>
  )
}
