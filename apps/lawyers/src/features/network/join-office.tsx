import { BrandLogo } from '@/features/brand'
import { messageOf } from '@/lib/api'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { Input } from '@pleadli/ui/input'
import { useId, useState, type ReactNode } from 'react'
import { useJoin, useLeave, useProbe, type Probe } from './data'
import { Fingerprint } from './fingerprint'

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="typeset flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-xl border border-border/60 bg-card p-6 shadow-sm">{children}</div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Refusal({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="not-typeset rounded-md border border-destructive/40 bg-destructive/5 p-2 text-destructive">
      {text}
    </p>
  ) : null
}

/** A new installation joining the firm's office computer instead of setting
 * up a practice of its own. Two steps: find the office and compare what it
 * presents with the office screen; then the one-time code and a name. */
export function JoinOffice({ onJoined, onCancel }: { onJoined: () => void; onCancel: () => void }) {
  const probe = useProbe()
  const join = useJoin()
  const [address, setAddress] = useState('')
  const [found, setFound] = useState<Probe | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)

  return (
    <Screen>
      <div className="flex items-center gap-3">
        <BrandLogo className="size-9" />
        <div>
          <h1>{m["network.join_screen_title"]()}</h1>
          <p className="text-muted-foreground">{m["network.join_screen_lead"]()}</p>
        </div>
      </div>

      {!found ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setRefusal(null)
            probe.mutate(address, { onSuccess: setFound, onError: (error) => setRefusal(messageOf(error)) })
          }}
        >
          <Field label={m["network.address"]()} hint={m["network.address_hint"]()}>
            {(id) => <Input id={id} name="address" inputMode="decimal" placeholder="192.168.1.20" value={address} onChange={(e) => setAddress(e.target.value)} autoFocus />}
          </Field>
          <Refusal text={refusal} />
          <div className="flex justify-between gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              {m["network.set_up_instead"]()}
            </Button>
            <Button type="submit" disabled={!address.trim() || probe.isPending}>
              {m["network.find"]()}
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setRefusal(null)
            join.mutate({ address: found.address, fingerprint: found.fingerprint, code, deviceName: name }, { onSuccess: onJoined, onError: (error) => setRefusal(messageOf(error)) })
          }}
        >
          <div className="flex flex-col gap-1.5">
            <h2>{found.officeName ?? found.address}</h2>
            <p className="text-muted-foreground">{found.address}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3>{m["network.compare_title"]()}</h3>
            <Fingerprint value={found.fingerprint} />
            <p className="text-muted-foreground">{m["network.compare_hint"]()}</p>
          </div>
          <Field label={m["network.code"]()} hint={m["network.code_where"]()}>
            {(id) => <Input id={id} name="code" autoComplete="off" placeholder="ABCD-2345" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono tracking-widest" />}
          </Field>
          <Field label={m["network.device_name"]()} hint={m["network.device_name_hint"]()}>
            {(id) => <Input id={id} name="deviceName" value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Refusal text={refusal} />
          <div className="flex justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFound(null)
                setRefusal(null)
              }}
            >
              {m["network.not_the_same"]()}
            </Button>
            <Button type="submit" disabled={code.replace(/[^A-Z0-9]/g, '').length < 8 || !name.trim() || join.isPending}>
              {m["network.join"]()}
            </Button>
          </div>
        </form>
      )}
    </Screen>
  )
}

/** A joined computer whose office does not answer. Nothing is kept here to
 * fall back on, so it says so plainly and waits. */
export function OfficeUnreachable({ message, onRetry, onLeft }: { message: string; onRetry: () => void; onLeft: () => void }) {
  const leave = useLeave()
  const [confirming, setConfirming] = useState(false)
  return (
    <Screen>
      <div className="flex items-center gap-3">
        <BrandLogo className="size-9" />
        <h1>{m["network.unreachable_title"]()}</h1>
      </div>
      <p>{message}</p>
      <div className="flex justify-between gap-2">
        {confirming ? (
          <Button variant="destructive" disabled={leave.isPending} onClick={() => leave.mutate(undefined, { onSuccess: onLeft })}>
            {m["network.leave_confirm"]()}
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            {m["network.leave"]()}
          </Button>
        )}
        <Button onClick={onRetry}>{m["network.try_again"]()}</Button>
      </div>
    </Screen>
  )
}
