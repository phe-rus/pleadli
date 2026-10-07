import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { api } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Segmented } from '@pleadli/ui/segmented'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import * as z from 'zod'

/** Where Ollama answers; Assist's own-server provider points here. */
export const LOCAL_BASE_URL = 'http://127.0.0.1:11434/v1'
export const isLocal = (baseUrl: string | null | undefined) => Boolean(baseUrl?.startsWith('http://127.0.0.1:11434'))

const jobSchema = z.object({ kind: z.string(), model: z.string().nullable(), completed: z.number(), total: z.number(), state: z.string(), error: z.string().nullable() })
const statusSchema = z.object({
  platform: z.enum(['windows', 'macos', 'linux']),
  installed: z.boolean(),
  running: z.boolean(),
  version: z.string().nullable(),
  models: z.array(z.object({ name: z.string(), size: z.number() })),
  memoryGb: z.number(),
  choices: z.array(z.object({ tag: z.string(), label: z.string(), downloadGb: z.number(), minMemoryGb: z.number() })),
  recommended: z.string(),
  installCommand: z.string().nullable(),
  job: jobSchema.nullable(),
})
type LocalStatus = z.infer<typeof statusSchema>

const call = async (method: 'GET' | 'POST', path: string, body?: unknown) => statusSchema.parse(await api(method, `/api/assist/local${path}`, body ? { body } : undefined))
const gb = (bytes: number) => (bytes / 1_073_741_824).toFixed(1)

/**
 * Assist on this computer: a free, open model (Gemma) run by Ollama, so
 * nothing leaves the machine. The app finds Ollama or opens its official
 * installer, offers the model size this computer's memory carries, downloads
 * it with its progress in view, and starts it. Nothing here needs knowing what
 * Ollama is.
 */
export function LocalModel({ isAdmin, chosenModel, onUse }: { isAdmin: boolean; chosenModel: string; onUse: (model: string) => void }) {
  const queryClient = useQueryClient()
  const status = useQuery({
    queryKey: ['assist', 'local'],
    queryFn: () => call('GET', ''),
    // While something downloads or the installer is open, look again every second.
    refetchInterval: (q) => (q.state.data?.job && !['done', 'failed'].includes(q.state.data.job.state)) || (q.state.data && !q.state.data.installed) ? 1500 : false,
  })
  const set = (s: LocalStatus) => queryClient.setQueryData(['assist', 'local'], s)
  const run = useMutation({
    mutationFn: (step: { path: string; body?: unknown }) => call('POST', step.path, step.body),
    onSuccess: set,
    onError: (e) => t.error(m["assist.local.failed"](), { description: e.message }),
  })
  const s = status.data
  const [pick, setPick] = useState<string | null>(null)
  if (!s) return null

  const choice = pick ?? (s.models.some((x) => x.name === chosenModel) ? chosenModel : s.recommended)
  const chosen = s.choices.find((c) => c.tag === choice) ?? s.choices[0]
  const have = s.models.some((x) => x.name === chosen.tag)
  const job = s.job && !(s.job.state === 'done' && s.job.kind === 'pull' && have) ? s.job : null
  const working = Boolean(job && !['done', 'failed'].includes(job.state))
  const pct = job && job.total > 0 ? Math.min(100, (job.completed / job.total) * 100) : 0

  return (
    <SettingsCard title={m["assist.local.title"]()} hint={m["assist.local.note"]()}>
      <SettingsRow
        label={m["assist.local.engine"]()}
        hint={s.running ? m["assist.local.running"]({ version: s.version ?? '' }) : s.installed ? m["assist.local.installed_not_running"]() : m["assist.local.not_installed"]()}
      >
        {s.running ? (
          <span className="text-muted-foreground">{m["assist.local.ready"]()}</span>
        ) : s.installed ? (
          <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate({ path: '/start' })}>
            {m["assist.local.start"]()}
          </Button>
        ) : s.installCommand ? (
          <code className="rounded-md bg-muted px-2 py-1 text-xs select-all">{s.installCommand}</code>
        ) : (
          <Button size="sm" disabled={!isAdmin || working || run.isPending} onClick={() => run.mutate({ path: '/install' })}>
            {m["assist.local.install"]()}
          </Button>
        )}
      </SettingsRow>

      <SettingsRow label={m["assist.local.model"]()} hint={s.memoryGb > 0 ? m["assist.local.memory"]({ memory: String(Math.round(s.memoryGb)), model: s.choices.find((c) => c.tag === s.recommended)?.label ?? '' }) : undefined}>
        <Segmented
          label={m["assist.local.model"]()}
          size="sm"
          value={chosen.tag}
          onChange={(v) => setPick(v)}
          items={s.choices.map((c) => ({ value: c.tag, label: c.tag === s.recommended ? `${c.label.replace('Gemma 4 ', '')} ★` : c.label.replace('Gemma 4 ', '') }))}
        />
      </SettingsRow>

      <SettingsRow
        label={chosen.label}
        hint={have ? (chosenModel === chosen.tag ? m["assist.local.in_use"]() : m["assist.local.downloaded"]()) : m["assist.local.size"]({ size: String(chosen.downloadGb) })}
      >
        {have ? (
          chosenModel === chosen.tag ? (
            <span className="text-muted-foreground">{m["assist.local.ready"]()}</span>
          ) : (
            <Button size="sm" disabled={!isAdmin} onClick={() => onUse(chosen.tag)}>
              {m["assist.local.use"]()}
            </Button>
          )
        ) : (
          <Button size="sm" disabled={!isAdmin || !s.installed || working || run.isPending} onClick={() => run.mutate({ path: '/pull', body: { model: chosen.tag } })}>
            {m["assist.local.download"]()}
          </Button>
        )}
      </SettingsRow>

      {job && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 text-[0.8125rem]">
            <span>
              {job.state === 'failed'
                ? m["assist.local.job_failed"]()
                : job.kind === 'install'
                  ? job.state === 'opening' || job.state === 'done'
                    ? m["assist.local.installer_open"]()
                    : m["assist.local.getting_installer"]()
                  : job.state === 'verifying'
                    ? m["assist.local.verifying"]()
                    : job.state === 'done'
                      ? m["assist.local.downloaded"]()
                      : m["assist.local.downloading"]({ model: s.choices.find((c) => c.tag === job.model)?.label ?? job.model ?? '' })}
            </span>
            {job.total > 0 && job.state !== 'failed' && <span className="text-muted-foreground tabular-nums">{m["assist.local.of"]({ done: gb(job.completed), total: gb(job.total) })}</span>}
          </div>
          {job.state === 'failed' ? (
            <p className="text-[0.8125rem] text-destructive">{job.error}</p>
          ) : (
            job.total > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]">
                <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
            )
          )}
        </div>
      )}
    </SettingsCard>
  )
}
