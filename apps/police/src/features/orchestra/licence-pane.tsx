import * as m from '@/paraglide/messages'
import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useMe } from '@/features/session'
import { format, formatDistanceToNowStrict } from '@/lib/date'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useState } from 'react'
import { orchestraErrorCode, type OrchestraStatus } from './data'
import { useActivateLicence, useChooseOffice, useContactNow, useOrchestra, useSendPapers } from './queries'
import { errorText, reasonText, stateText } from './words'

function stateTone(s: OrchestraStatus) {
  return s.state === 'licensed' ? 'done' : s.state === 'trial' ? 'waiting' : 'open'
}

/** This computer's standing with Pleadli: the trial or the licence, when it
 * last spoke to pleadli.com, and for an administrator, the licence key. Nothing
 * here can lock a record: the hint says so wherever a trial or licence ends. */
export function LicencePane() {
  const { data: status } = useOrchestra()
  const { data: me } = useMe()
  const admin = me?.role === 'admin'
  const contact = useContactNow()

  if (!status) return null
  const ended = status.state === 'trial_ended' || status.state === 'licence_ended'

  return (
    <>
      <SettingsCard
        title={m["orchestra.licence.this_computer"]()}
        badge={<Tag tone={stateTone(status)}>{stateText(status)}</Tag>}
        description={
          status.state === 'trial'
            ? m["orchestra.licence.trial_about"]({ date: format(status.trialEndsAt, 'PP') })
            : status.state === 'licence_ended'
              ? reasonText(status.reason)
              : status.state === 'trial_ended'
                ? m["orchestra.licence.trial_ended_about"]()
                : undefined
        }
        hint={ended ? m["orchestra.licence.never_locked"]() : undefined}
        action={
          admin ? (
            <Button
              size="sm"
              variant="outline"
              disabled={contact.isPending}
              onClick={async () => {
                try {
                  await contact.mutateAsync()
                  t.success(m["orchestra.licence.checked"]())
                } catch (e) {
                  t.error(errorText(orchestraErrorCode(e)))
                }
              }}
            >
              {contact.isPending ? m["orchestra.licence.checking"]() : m["orchestra.licence.check_now"]()}
            </Button>
          ) : undefined
        }
      >
        {status.licence && (
          <>
            <SettingsRow label={m["orchestra.licence.institution"]()}>
              <span className="text-muted-foreground">{status.licence.institution}</span>
            </SettingsRow>
            {status.licence.address && (
              <SettingsRow label={m["orchestra.licence.address"]()}>
                <span className="font-mono text-muted-foreground">{status.licence.address}</span>
              </SettingsRow>
            )}
            <SettingsRow label={m["orchestra.licence.seats"]()}>
              <span className="text-muted-foreground tabular-nums">{status.licence.seats}</span>
            </SettingsRow>
            <SettingsRow label={m["orchestra.licence.expires"]()} hint={m["orchestra.licence.valid_until"]({ date: format(status.licence.validUntil, 'PP') })}>
              <span className="text-muted-foreground">{format(status.licence.expiresAt, 'PP')}</span>
            </SettingsRow>
          </>
        )}
        <SettingsRow label={m["orchestra.licence.last_contact"]()} hint={status.lastError ? errorText(status.lastError) : undefined}>
          <span className="text-muted-foreground">
            {status.lastContactAt ? formatDistanceToNowStrict(Math.min(status.lastContactAt, Date.now()), { addSuffix: true }) : m["orchestra.licence.never"]()}
          </span>
        </SettingsRow>
        {admin && status.device && (
          <SettingsRow label={m["orchestra.licence.device"]()} hint={m["orchestra.licence.device_hint"]()}>
            <span className="font-mono text-muted-foreground">{status.device}</span>
          </SettingsRow>
        )}
      </SettingsCard>

      {!status.canVerify && <p className="px-1 text-destructive">{m["orchestra.licence.cannot_verify"]()}</p>}

      {status.state !== 'licensed' && <ActivateCard admin={admin} />}
      {status.state === 'licensed' && <PapersCard status={status} admin={admin} />}
    </>
  )
}

function ActivateCard({ admin }: { admin: boolean }) {
  const activate = useActivateLicence()
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!admin) {
    return <SettingsCard title={m["orchestra.activate.title"]()} description={m["orchestra.activate.ask_admin"]()} />
  }

  return (
    <SettingsCard
      title={m["orchestra.activate.title"]()}
      description={m["orchestra.activate.about"]()}
      hint={error ?? m["orchestra.activate.hint"]()}
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        try {
          await activate.mutateAsync(key)
          setKey('')
          t.success(m["orchestra.activate.done"]())
        } catch (e) {
          setError(errorText(orchestraErrorCode(e)))
        }
      }}
      action={
        <Button size="sm" type="submit" disabled={activate.isPending || key.trim().length < 10}>
          {activate.isPending ? m["orchestra.activate.activating"]() : m["orchestra.activate.activate"]()}
        </Button>
      }
    >
      <SettingsRow label={m["orchestra.activate.key"]()}>
        {(id) => (
          <Input
            id={id}
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
            placeholder="PLD-XXXX-XXXX-XXXX"
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        )}
      </SettingsRow>
    </SettingsCard>
  )
}

/** Papers that leave the station (charge sheets, police bonds, letters) are
 * known to pleadli.com/verify by their fingerprint, never their wording. */
function PapersCard({ status, admin }: { status: OrchestraStatus; admin: boolean }) {
  const office = useChooseOffice()
  const send = useSendPapers()
  const items = status.offices.map((o) => ({ value: o.address, label: `${o.name} · ${o.address}` }))

  return (
    <SettingsCard
      title={m["orchestra.papers.title"]()}
      description={m["orchestra.papers.about"]()}
      hint={status.papers.failed > 0 ? m["orchestra.papers.failed"]({ count: String(status.papers.failed) }) : undefined}
      action={
        admin && status.papers.waiting > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={send.isPending}
            onClick={async () => {
              try {
                const { sent } = await send.mutateAsync()
                t.success(m["orchestra.papers.sent_now"]({ count: String(sent) }))
              } catch (e) {
                t.error(errorText(orchestraErrorCode(e)))
              }
            }}
          >
            {m["orchestra.papers.send_now"]()}
          </Button>
        ) : undefined
      }
    >
      <SettingsRow label={m["orchestra.papers.office"]()} hint={m["orchestra.papers.office_hint"]()}>
        {(id) =>
          admin && items.length > 1 ? (
            <Select
              items={items}
              value={status.office ?? ''}
              onValueChange={async (value) => {
                if (!value) return
                try {
                  await office.mutateAsync(value)
                } catch (e) {
                  t.error(errorText(orchestraErrorCode(e)))
                }
              }}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {items.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <span id={id} className="font-mono text-muted-foreground">
              {status.office ?? '·'}
            </span>
          )
        }
      </SettingsRow>
      <SettingsRow label={m["orchestra.papers.sent"]()}>
        <span className="text-muted-foreground tabular-nums">{status.papers.sent}</span>
      </SettingsRow>
      <SettingsRow label={m["orchestra.papers.waiting"]()}>
        <span className="text-muted-foreground tabular-nums">{status.papers.waiting}</span>
      </SettingsRow>
    </SettingsCard>
  )
}
