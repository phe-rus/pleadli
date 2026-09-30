import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import { products } from '@/data/products'
import {
  CheckmarkCircle02Icon,
  CircleIcon,
  Folder02Icon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'

export const Route = createFileRoute('/_public/docs/documents')({
  component: RouteComponent,
})

const pipeline = [
  { title: 'Folder', description: 'Where a document lives, inside the case or matter it belongs to.' },
  { title: 'Document', description: 'The record itself: type, reference number, author, date.' },
  { title: 'Version', description: 'What changed and when, without losing what came before.' },
  { title: 'Preview', description: 'What it will actually look like, not a filename and a download icon.' },
  { title: 'Sign / issue', description: 'The point a document becomes an official record, where the law requires that step.' },
  { title: 'Freeze', description: 'Once issued, the content can no longer change, only be superseded.' },
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
        <Badge variant="outline">
          <HugeiconsIcon icon={Folder02Icon} data-icon="inline-start" />
          Documents
        </Badge>
        <h1 className="text-3xl!">Documents are the record, not an attachment</h1>
        <p>
          A charge sheet, a signed sitting record, or a filed bail application isn't supporting
          material for a case, it usually <em>is</em> the thing that matters legally. Pleadli
          treats a document as a first-class object moving through a real pipeline, not a file
          bolted onto the bottom of a form.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {pipeline.map((step, index) => (
          <div key={step.title} className="flex flex-col gap-1 rounded-lg border p-3">
            <span className="text-xs font-medium text-muted-foreground">{index + 1}</span>
            <span className="text-sm font-medium">{step.title}</span>
            <span className="text-xs text-muted-foreground">{step.description}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xl!">How far each application actually goes</h2>
        <div className="flex flex-col gap-2">
          {products.map((product) => (
            <Link
              key={product.slug}
              to="/products/$slug"
              params={{ slug: product.slug }}
              className="flex items-start gap-3 rounded-lg border p-3 hover:border-primary/40"
            >
              <StatusIcon state={product.documents.state} />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{product.name}</span>
                <span className="text-sm text-muted-foreground">{product.documents.detail}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">What no application has yet</h2>
        <ul className="flex flex-col gap-1.5">
          {[
            'A real folder or file-manager view, browsing documents the way a case actually organises them.',
            'DOCX import and round-trip editing that preserves page structure, headers, footers, and signatures, not just export.',
            'A page-like preview showing roughly what the physical document will look like while it’s still being drafted.',
            'A shared document architecture across applications; each one currently has its own separate model.',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <Card className="gap-2 p-4">
        <CardTitle>What already works well</CardTitle>
        <CardDescription>
          DPP, Courts, and Lawyers already issue documents with a real reference number and a
          cryptographic hash, and freeze them once issued, database-enforced, not just a UI rule.
          That's the hard, load-bearing part. The folder browser and DOCX fidelity work ahead of it
          is real work, but it builds on a foundation that's already sound.
        </CardDescription>
      </Card>
    </div>
  )
}
