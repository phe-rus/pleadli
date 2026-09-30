import { Badge } from '@pleadli/ui/badge'
import { Card, CardDescription, CardTitle } from '@pleadli/ui/card'
import {
  Mic01Icon,
  Robot01Icon,
  ShieldQuestionMarkIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/docs/ai')({
  component: RouteComponent,
})

const boundaries = [
  { title: 'AI generated', description: 'Produced by a model, not yet looked at by anyone.' },
  { title: 'AI suggested', description: 'Offered as a draft, clearly marked, sitting next to the real record.' },
  { title: 'Human reviewed', description: 'A person has read it and either corrected it or accepted it as-is.' },
  { title: 'Official record', description: 'What actually counts, legally, once a person has adopted it.' },
] as const

function RouteComponent() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Badge variant="outline">
          <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" />
          AI
        </Badge>
        <h1 className="text-3xl!">Designed carefully, built almost nowhere yet</h1>
        <p>
          No Pleadli application has a working AI feature today. What exists instead is a
          deliberate design, one real honest stub proving the pattern, and a boundary that's meant
          to hold regardless of which application eventually uses it: AI assists, it never becomes
          the record by itself.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {boundaries.map((item) => (
          <Card key={item.title} className="p-4">
            <CardTitle>{item.title}</CardTitle>
            <CardDescription className="text-sm">{item.description}</CardDescription>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">The one honest example that exists today</h2>
        <Card className="gap-2 p-4">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Mic01Icon} className="text-muted-foreground" />
            <CardTitle>Pleadli Courts' transcription seam</CardTitle>
          </div>
          <CardDescription>
            Courts has a real API endpoint reserved for hearing transcription. Today it correctly
            returns "unavailable" rather than inventing text, no transcription engine ships yet. A
            machine-produced draft, once one exists, can never be adopted into a signed sitting
            record until a person has corrected it first, that refusal is enforced by the database,
            not just a UI warning. This is the pattern the rest of the ecosystem's AI work is meant
            to follow.
          </CardDescription>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xl!">The design: provider-agnostic, permissioned</h2>
        <p>
          Pleadli Prisons has the most complete AI design written down (not built): bring your own
          API key from a supported provider, scoped to what that application is allowed to see, with
          an explicit suggest-never-decide boundary. The intent for the rest of the ecosystem is the
          same shape, not a different AI feature bolted onto each application separately:
        </p>
        <ul className="flex flex-col gap-1.5">
          {[
            'A shared, provider-agnostic layer (bring your own key: Anthropic, OpenAI, Gemini, or a compatible provider), not one model hard-coded into every feature.',
            'Explicit context providers per application: a Police assistant sees Police’s own structure, never another institution’s records.',
            'A privacy-preserving default: temporary context is discarded, not folded into a persistent memory the AI accumulates over time.',
            'Nothing adopted into a real record without a person reading and accepting it first, the Courts transcription seam is the working proof of this rule, not just a stated intention.',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-dashed p-4">
        <HugeiconsIcon icon={ShieldQuestionMarkIcon} className="mt-0.5 size-5! shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Where AI touches something privileged or confidential, most acutely in Pleadli Lawyers,
          it inherits whatever access controls that application has. Right now Lawyers has no app
          lock or per-matter access control at all, so AI work there waits on that security work
          landing first, not the other way around.
        </p>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <HugeiconsIcon icon={Robot01Icon} className="size-4! shrink-0" />
        Nothing on this page is a shipped feature. It's the boundary the ecosystem is committing to
        before any AI feature ships, not after.
      </div>
    </div>
  )
}
