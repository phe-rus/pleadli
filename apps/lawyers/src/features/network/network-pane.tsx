import { RowList, Row } from '@/components/operational-row'
import { SettingsCard } from '@/components/settings-card'
import { Tag } from '@/components/status-tag'
import { useSessionStatus } from '@/features/installation'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns/format'
import { useEffect, useState } from 'react'
import { networkOptions, usePairingCode, useLeave, useRemoveDevice, useSetOffice, type PairingCode } from './data'
import { Fingerprint } from './fingerprint'

function Refusal({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
      {text}
    </p>
  ) : null
}

function useCountdown(until: number | null) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!until) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [until])
  if (!until) return null
  const left = Math.max(0, Math.round((until - now) / 1000))
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
}

/** Settings > Network: whether this computer is alone, the office computer
 * others join, or a computer joined to one. */
export function NetworkPane() {
  const { data: network, refetch } = useQuery({ ...networkOptions(), refetchInterval: 10_000 })
  const { data: session } = useSessionStatus()
  const isAdmin = session?.actor?.isAdmin === true
  if (!network) return null
  if (network.mode === 'terminal') return <JoinedCard />
  if (network.mode === 'office') return <OfficeCards isAdmin={isAdmin} onChanged={() => void refetch()} />
  return <StandaloneCard isAdmin={isAdmin} protectionNone={session?.level === 'none'} />
}

function StandaloneCard({ isAdmin, protectionNone }: { isAdmin: boolean; protectionNone: boolean }) {
  const queryClient = useQueryClient()
  const setOffice = useSetOffice()
  const [refusal, setRefusal] = useState<string | null>(null)
  return (
    <SettingsCard
      title={m["network.office_title"]()}
      badge={<Tag tone="neutral">{m["network.mode.standalone"]()}</Tag>}
      description={m["network.office_description"]()}
      hint={protectionNone ? m["network.needs_sign_in"]() : !isAdmin ? m["network.admin_only"]() : m["network.office_hint"]()}
      action={
        <Button
          size="sm"
          disabled={!isAdmin || protectionNone || setOffice.isPending}
          onClick={() => {
            setRefusal(null)
            setOffice.mutate(true, {
              onSuccess: (status) => queryClient.setQueryData(networkOptions().queryKey, status),
              onError: (error) => setRefusal(messageOf(error)),
            })
          }}
        >
          {m["network.make_office"]()}
        </Button>
      }
    >
      <Refusal text={refusal} />
    </SettingsCard>
  )
}

function OfficeCards({ isAdmin, onChanged }: { isAdmin: boolean; onChanged: () => void }) {
  const queryClient = useQueryClient()
  const { data: network } = useQuery(networkOptions())
  const setOffice = useSetOffice()
  const newCode = usePairingCode()
  const remove = useRemoveDevice()
  const [code, setCode] = useState<PairingCode | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const left = useCountdown(code?.expiresAt ?? null)
  if (!network) return null
  const expired = left === '0:00'
  const active = network.devices.filter((d) => !d.revokedAt)
  const removed = network.devices.filter((d) => d.revokedAt)

  return (
    <>
      <SettingsCard
        title={m["network.office_title"]()}
        badge={network.listening ? <Tag tone="done">{m["network.listening"]()}</Tag> : <Tag tone="open">{m["network.starting"]()}</Tag>}
        description={m["network.office_on_description"]()}
      >
        <div className="flex flex-col gap-1.5">
          <h4>{m["network.address"]()}</h4>
          {network.addresses.length > 0 ? (
            network.addresses.map((a) => (
              <p key={a} className="not-typeset font-mono text-lg text-foreground">
                {a}
              </p>
            ))
          ) : (
            <p className="text-muted-foreground">{m["network.no_address"]()}</p>
          )}
        </div>
        {network.fingerprint && (
          <div className="flex flex-col gap-1.5">
            <h4>{m["network.fingerprint"]()}</h4>
            <Fingerprint value={network.fingerprint} />
            <p className="text-muted-foreground">{m["network.fingerprint_hint"]()}</p>
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        title={m["network.join_title"]()}
        description={m["network.join_description"]()}
        hint={isAdmin ? m["network.code_hint"]() : m["network.admin_only"]()}
        action={
          <Button
            size="sm"
            disabled={!isAdmin || newCode.isPending}
            onClick={() => {
              setRefusal(null)
              newCode.mutate(undefined, { onSuccess: setCode, onError: (error) => setRefusal(messageOf(error)) })
            }}
          >
            {code && !expired ? m["network.new_code"]() : m["network.show_code"]()}
          </Button>
        }
      >
        {code && !expired && (
          <div className="flex flex-col items-start gap-1">
            <p className="not-typeset font-mono text-3xl tracking-[0.2em] text-foreground">{code.code}</p>
            <p className="text-muted-foreground">{m["network.code_expires"]({ left: left ?? '' })}</p>
          </div>
        )}
        {code && expired && <p className="text-muted-foreground">{m["network.code_expired"]()}</p>}
        <ol className="list-decimal pl-5">
          <li>{m["network.step_open"]()}</li>
          <li>{m["network.step_type"]()}</li>
          <li>{m["network.step_compare"]()}</li>
        </ol>
        <Refusal text={refusal} />
      </SettingsCard>

      <SettingsCard title={m["network.devices_title"]()} description={m["network.devices_description"]()}>
        {active.length === 0 ? (
          <p className="text-muted-foreground">{m["network.no_devices"]()}</p>
        ) : (
          <RowList>
            {active.map((d) => (
              <Row
                key={d.id}
                title={d.name}
                summary={m["network.device_meta"]({
                  joined: format(d.pairedAt, 'PP'),
                  seen: d.lastSeenAt ? format(d.lastSeenAt, 'PPp') : '·',
                  address: d.lastAddress ?? '·',
                })}
                trailing={
                  isAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={remove.isPending}
                      onClick={() =>
                        remove.mutate(d.id, {
                          onSuccess: (status) => {
                            queryClient.setQueryData(networkOptions().queryKey, status)
                            t.success(m["network.removed"]({ name: d.name }))
                          },
                          onError: (error) => t.error(messageOf(error)),
                        })
                      }
                    >
                      {m["network.remove"]()}
                    </Button>
                  )
                }
              />
            ))}
          </RowList>
        )}
        {removed.length > 0 && <p className="text-muted-foreground">{m["network.removed_count"]({ count: String(removed.length) })}</p>}
      </SettingsCard>

      {isAdmin && (
        <SettingsCard
          danger
          title={m["network.stop_title"]()}
          description={m["network.stop_description"]()}
          action={
            <Button
              size="sm"
              variant="destructive"
              disabled={setOffice.isPending}
              onClick={() =>
                setOffice.mutate(false, {
                  onSuccess: (status) => {
                    queryClient.setQueryData(networkOptions().queryKey, status)
                    onChanged()
                  },
                  onError: (error) => t.error(messageOf(error)),
                })
              }
            >
              {m["network.stop"]()}
            </Button>
          }
        />
      )}
    </>
  )
}

function JoinedCard() {
  const queryClient = useQueryClient()
  const { data: network } = useQuery(networkOptions())
  const leave = useLeave()
  if (!network) return null
  return (
    <>
      <SettingsCard
        title={m["network.joined_title"]({ office: network.officeName ?? '' })}
        badge={network.reachable ? <Tag tone="done">{m["network.reachable"]()}</Tag> : <Tag tone="urgent">{m["network.unreachable"]()}</Tag>}
        description={m["network.joined_description"]()}
      >
        <div className="flex flex-col gap-1.5">
          <h4>{m["network.address"]()}</h4>
          <p className="not-typeset font-mono text-lg text-foreground">{network.officeAddress}</p>
        </div>
        {network.officeFingerprint && (
          <div className="flex flex-col gap-1.5">
            <h4>{m["network.fingerprint"]()}</h4>
            <Fingerprint value={network.officeFingerprint} />
          </div>
        )}
      </SettingsCard>
      <SettingsCard
        danger
        title={m["network.leave_title"]()}
        description={m["network.leave_description"]()}
        action={
          <Button
            size="sm"
            variant="destructive"
            disabled={leave.isPending}
            onClick={() =>
              leave.mutate(undefined, {
                onSuccess: () => {
                  queryClient.clear()
                  window.location.assign('/')
                },
                onError: (error) => t.error(messageOf(error)),
              })
            }
          >
            {m["network.leave"]()}
          </Button>
        }
      />
    </>
  )
}
