import { usePrintOnMount } from '@/hooks/use-print-on-mount'
import { chargesForFileOptions, useChargesForFile } from '@/features/charges'
import { ChargeSheetPrintable, decisionsForFileOptions, useDecisionsForFile } from '@/features/decisions'
import { filePeopleOptions, prosecutionFileOptions, useFilePeople, useProsecutionFile } from '@/features/prosecution-files'
import { prosecutorProfileOptions, useProsecutorProfile } from '@/features/prosecutor-profile'
import { statementsForFileOptions, useStatementsForFile } from '@/features/statements'
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/print/charge-sheets/$fileId/$decisionId')({
  loader: async ({ context, params }) => {
    const [file, decisions] = await Promise.all([
      context.queryClient.query({ ...prosecutionFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...decisionsForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...chargesForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...filePeopleOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...statementsForFileOptions(params.fileId), staleTime: 'static' }),
      context.queryClient.query({ ...prosecutorProfileOptions(), staleTime: 'static' }),
    ])
    if (!file || !decisions.some((d) => d.id === params.decisionId)) throw notFound()
  },
  component: RouteComponent,
})

/**
 * DPP's own sanctioned Charge Sheet, generated from the file's own
 * structured data rather than retyped (docs/dpp/PRODUCT.md's "resulting
 * document" gap) — same `/print/...` + `usePrintOnMount` pattern Police
 * uses for its own PF 53, so the two never drift apart architecturally.
 */
function RouteComponent() {
  const { fileId, decisionId } = Route.useParams()
  const { data: file } = useProsecutionFile(fileId)
  const { data: decisions } = useDecisionsForFile(fileId)
  const { data: charges } = useChargesForFile(fileId)
  const { data: filePeople } = useFilePeople(fileId)
  const { data: statements } = useStatementsForFile(fileId)
  const { data: prosecutorProfile } = useProsecutorProfile()
  usePrintOnMount()

  const decision = decisions.find((d) => d.id === decisionId)
  if (!file || !decision) return null

  const accused = filePeople.find((p) => p.role === 'accused')
  const accusedName = accused ? `${accused.personLastName}, ${accused.personFirstName}` : null

  const preferringOfficer = statements.find((s) => s.statementRole === 'arresting_officer')
  const preferredByName = preferringOfficer ? `${preferringOfficer.personLastName}, ${preferringOfficer.personFirstName}` : null

  return (
    <article className="container flex flex-col gap-6 pt-5 pb-20">
      <button type="button" onClick={() => window.history.back()} className="w-fit text-xs text-muted-foreground print:hidden">
        ← Back
      </button>
      <ChargeSheetPrintable
        file={file}
        charges={charges}
        decision={decision}
        accusedName={accusedName}
        preferredByName={preferredByName}
        prosecutorProfile={prosecutorProfile ?? null}
      />
    </article>
  )
}
