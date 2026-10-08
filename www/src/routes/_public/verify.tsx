import { CodeForm, codeSearch, formatDate } from '@/components/public-code'
import { verifyPaper } from '@/functions/public.func'
import { seo } from '@/lib/seo'
import * as m from '@/paraglide/messages'
import { Alert02Icon, CancelCircleIcon, CheckmarkCircle02Icon, FileSearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@pleadli/ui/button'
import { Card } from '@pleadli/ui/card'
import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'

export const Route = createFileRoute('/_public/verify')({
  head: () => seo({ title: m["verify.meta_title"](), description: m["verify.meta_description"](), path: '/verify' }),
  validateSearch: codeSearch,
  loaderDeps: ({ search }) => ({ code: search.code }),
  loader: ({ deps }) => (deps.code ? verifyPaper({ data: { code: deps.code } }) : undefined),
  component: RouteComponent,
})

const kinds: Record<string, () => string> = {
  charge_sheet: () => m["verify.kind.charge_sheet"](),
  bond: () => m["verify.kind.bond"](),
  police_bond: () => m["verify.kind.police_bond"](),
  order: () => m["verify.kind.order"](),
  warrant: () => m["verify.kind.warrant"](),
  summons: () => m["verify.kind.summons"](),
  judgment: () => m["verify.kind.judgment"](),
  release_warrant: () => m["verify.kind.release_warrant"](),
  letter: () => m["verify.kind.letter"](),
}

function RouteComponent() {
  const { code } = Route.useSearch()
  const result = Route.useLoaderData()

  return (
    <article className="container flex w-full flex-col md:max-w-3xl">
      <section className="flex flex-col gap-5 py-16 md:py-24">
        <h1 className="text-3xl tracking-tight md:text-5xl!">{m["verify.title"]()}</h1>
        <p className="md:max-w-xl md:text-lg!">{m["verify.lead"]()}</p>
        <CodeForm from="/verify" code={code} label={m["verify.code"]()} hint={m["verify.code_hint"]()} submit={m["verify.check"]()} />
      </section>

      {code && result === null && (
        <Card className="flex-row gap-4 p-6">
          <HugeiconsIcon icon={CancelCircleIcon} className="mt-1 shrink-0 text-destructive" />
          <div className="flex flex-col gap-1">
            <h2 className="text-xl!">{m["verify.not_found"]()}</h2>
            <p className="text-muted-foreground">{m["verify.not_found_body"]()}</p>
          </div>
        </Card>
      )}

      {result && <Verdict key={result.code} paper={result} />}

      <p className="py-16 text-sm text-muted-foreground">{m["verify.privacy"]()}</p>
    </article>
  )
}

type Paper = NonNullable<Awaited<ReturnType<typeof verifyPaper>>>

function Verdict({ paper }: { paper: Paper }) {
  const withdrawn = paper.withdrawnAt !== null
  const kind = (kinds[paper.kind] ?? (() => m["verify.kind.other"]()))()

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex-row gap-4 p-6">
        <HugeiconsIcon icon={withdrawn ? Alert02Icon : CheckmarkCircle02Icon} className={withdrawn ? 'mt-1 shrink-0 text-destructive' : 'mt-1 shrink-0 text-primary'} />
        <div className="flex flex-col gap-1">
          <h2 className="text-xl!">{withdrawn ? m["verify.withdrawn"]() : m["verify.genuine"]()}</h2>
          <p>{m["verify.genuine_body"]({ kind, reference: paper.reference, office: paper.office, date: formatDate(paper.issuedAt) })}</p>
          {withdrawn && (
            <p className="text-destructive">
              {m["verify.withdrawn_body"]({ date: formatDate(paper.withdrawnAt!) })}
              {paper.withdrawnReason && ` ${paper.withdrawnReason}`}
            </p>
          )}
          {paper.office !== paper.institution && (
            <p className="text-muted-foreground">
              {m["verify.institution"]()}: {paper.institution}
            </p>
          )}
        </div>
      </Card>
      <FileCheck expected={paper.fileSha256} />
    </div>
  )
}

/** Compares a PDF the visitor holds with the one issued, in their browser:
 * only its SHA-256 is computed, and the file is never uploaded. */
function FileCheck({ expected }: { expected: string | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [same, setSame] = useState<boolean | null>(null)

  async function check(file: File | undefined) {
    if (!file || !expected) return
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    setSame(hex === expected.toLowerCase())
  }

  return (
    <Card className="flex-row gap-4 p-6">
      <HugeiconsIcon icon={FileSearchIcon} className="mt-1 shrink-0 text-primary" />
      <div className="flex flex-col gap-3">
        <h2 className="text-xl!">{m["verify.file_title"]()}</h2>
        {expected ? (
          <>
            <p className="text-muted-foreground">{m["verify.file_body"]()}</p>
            <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => check(e.target.files?.[0])} />
            <Button className="w-fit" variant="secondary" onClick={() => input.current?.click()}>
              {m["verify.file_choose"]()}
            </Button>
            {same !== null && <p className={same ? 'text-primary' : 'text-destructive'}>{same ? m["verify.file_same"]() : m["verify.file_differs"]()}</p>}
          </>
        ) : (
          <p className="text-muted-foreground">{m["verify.file_none"]()}</p>
        )}
      </div>
    </Card>
  )
}
