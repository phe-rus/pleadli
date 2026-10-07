import { listReportsStaff, replyToReport } from '@/functions/staff.func'
import { Button } from '@pleadli/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@pleadli/ui/dialog'
import { t } from '@pleadli/ui/goey-toaster'
import { Group, GroupRow } from '@pleadli/ui/grouped'
import { Segmented } from '@pleadli/ui/segmented'
import { Textarea } from '@pleadli/ui/textarea'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/admin/reports')({
  loader: () => listReportsStaff(),
  component: RouteComponent,
})

const kindName: Record<string, string> = { crash: 'Crash', issue: 'Issue', question: 'Question' }

/** Crash reports, issues and questions from the apps and from /orchestra,
 * answered here. They never carry case data. */
function RouteComponent() {
  const rows = Route.useLoaderData()
  const router = useRouter()
  const [view, setView] = useState<'open' | 'all'>('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const shown = view === 'open' ? rows.filter((r) => r.status === 'open') : rows
  const current = rows.find((r) => r.id === openId)

  const answer = async (status: 'answered' | 'closed') => {
    if (!current) return
    try {
      await replyToReport({ data: { reportId: current.id, reply: reply || undefined, status } })
      t.success(status === 'answered' ? 'Answer saved' : 'Closed')
      setOpenId(null)
      setReply('')
      void router.invalidate()
    } catch (e) {
      t.error(e instanceof Error ? e.message : 'That did not work.')
    }
  }

  return (
    <article className="container flex flex-col gap-6 py-10 md:max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Reports</h1>
          <p className="text-muted-foreground">Crashes, issues and questions sent in from the apps and institutions.</p>
        </div>
        <Segmented label="Show" value={view} onChange={setView} items={[{ value: 'open', label: 'To answer' }, { value: 'all', label: 'All' }]} />
      </header>
      {shown.length === 0 ? (
        <p className="rounded-xl bg-muted/40 p-6 text-center text-muted-foreground">Nothing to answer.</p>
      ) : (
        <Group>
          {shown.map((r) => (
            <GroupRow
              key={r.id}
              label={r.title}
              detail={[kindName[r.kind] ?? r.kind, r.application && `Pleadli ${r.application}`, r.version && `v${r.version}`, r.institution].filter(Boolean).join(' · ')}
              value={new Date(r.createdAt).toLocaleDateString()}
              chevron
              onClick={() => {
                setOpenId(r.id)
                setReply(r.reply ?? '')
              }}
            />
          ))}
        </Group>
      )}
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          {current && (
            <>
              <DialogHeader>
                <DialogTitle>{current.title}</DialogTitle>
                <DialogDescription>{[kindName[current.kind], current.institution, new Date(current.createdAt).toLocaleString()].filter(Boolean).join(' · ')}</DialogDescription>
              </DialogHeader>
              <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-4 text-sm">{current.body}</p>
              <label className="flex flex-col gap-1.5 text-sm">
                Answer
                <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <Button onClick={() => answer('answered')} disabled={!reply.trim()}>
                  Save answer
                </Button>
                <Button variant="secondary" onClick={() => answer('closed')}>
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </article>
  )
}
