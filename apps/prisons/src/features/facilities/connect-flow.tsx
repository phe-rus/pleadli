import { ApiError } from '@/lib/api'
import { ArrowLeft01Icon, CheckmarkCircle02Icon, Search01Icon, PrisonIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'
import { useState } from 'react'
import { useConnectFacility, useFacilityLookup, usePairWithHeadOffice, usePairWithHeadOfficeLater } from './queries'
import { facilityRegions, facilityStatusLabel, type ConnectScope, type FacilityLookup, type RegisterFacilityInput } from './schema'
import { StepsProgress } from './steps-progress'

const ADDRESS_KEY = 'pleadli:prisons:hq-address'

function readAddress() {
  try {
    return localStorage.getItem(ADDRESS_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberAddress(value: string) {
  try {
    localStorage.setItem(ADDRESS_KEY, value.includes('#') ? value.slice(0, value.lastIndexOf('#')) : value)
  } catch {
    // Remembering the address is a convenience only.
  }
}

export const connectSteps = ['Head Office', 'Your facility', 'Approval'] as const

type Requester = { badge: string; name: string }

type ConnectFlowProps = {
  scope: ConnectScope
  /** Prefilled from the signed-in officer once one exists. */
  requester?: Requester
  /** True once an officer is signed in: who is connecting is then a fact, not an input. */
  lockRequester?: boolean
  onConnected: (facilityName: string) => void
  onPending: (facilityName: string) => void
  onSkip?: () => void
}

type Step = 'address' | 'facility' | 'details'

/**
 * Connect this installation to a facility Head Office already knows: give
 * Head Office's address, type the facility's number and confirm it is the
 * right one, then say who is connecting. An activation code connects at once;
 * otherwise Head Office approves the request. A facility Head Office has not
 * heard of falls back to registering it with a pairing code.
 */
export function ConnectFlow({ scope, requester, lockRequester = false, onConnected, onPending, onSkip }: ConnectFlowProps) {
  const [step, setStep] = useState<Step>('address')
  const [address, setAddress] = useState(readAddress)
  const [number, setNumber] = useState('')

  return (
    <div className="flex flex-col gap-6">
      <StepsProgress steps={connectSteps} current={step === 'address' ? 0 : 1} />
      {step === 'address' && (
        <AddressStep
          value={address}
          onChange={setAddress}
          onNext={() => {
            rememberAddress(address.trim())
            setStep('facility')
          }}
          onSkip={onSkip}
        />
      )}
      {step === 'facility' && (
        <FacilityStep
          scope={scope}
          address={address.trim()}
          number={number}
          onNumberChange={setNumber}
          requester={requester}
          lockRequester={lockRequester}
          onBack={() => setStep('address')}
          onConnected={onConnected}
          onPending={onPending}
          onRegisterNew={address.includes('#') ? () => setStep('details') : undefined}
        />
      )}
      {step === 'details' && (
        <DetailsStep scope={scope} pairingCode={address.trim()} facilityNumber={number} onBack={() => setStep('facility')} onConnected={onConnected} />
      )}
    </div>
  )
}

function AddressStep({ value, onChange, onNext, onSkip }: { value: string; onChange: (value: string) => void; onNext: () => void; onSkip?: () => void }) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        onNext()
      }}
    >
      <Field>
        <FieldLabel>Head Office address</FieldLabel>
        <Input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="https://hq.example.org or a pairing code"
          autoComplete="url"
          inputMode="url"
          spellCheck={false}
          className="font-mono text-xs"
        />
        <FieldDescription>The address Head Office gave you, or paste its pairing code. It is remembered for next time.</FieldDescription>
      </Field>
      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={value.trim().length === 0} className="w-full">
          Continue
        </Button>
        {onSkip && (
          <Button type="button" variant="secondary" className="w-full" onClick={onSkip}>
            Continue without Head Office
          </Button>
        )}
      </div>
    </form>
  )
}

function FacilityCard({ facility }: { facility: FacilityLookup }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
          <HugeiconsIcon icon={PrisonIcon} size={18} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{facility.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {facility.location} · {facility.region} region
          </span>
        </div>
        <Badge variant={facility.status === 'active' ? 'default' : 'secondary'}>{facilityStatusLabel(facility.status)}</Badge>
      </div>
      {facility.status === 'active' && (
        <p className="text-xs text-muted-foreground">
          Another installation is already connected as this facility. If Head Office approves this request, that connection is replaced.
        </p>
      )}
    </div>
  )
}

function FacilityStep({
  scope,
  address,
  number,
  onNumberChange,
  requester,
  lockRequester,
  onBack,
  onConnected,
  onPending,
  onRegisterNew,
}: {
  scope: ConnectScope
  address: string
  number: string
  onNumberChange: (value: string) => void
  requester?: Requester
  lockRequester: boolean
  onBack: () => void
  onConnected: (facilityName: string) => void
  onPending: (facilityName: string) => void
  onRegisterNew?: () => void
}) {
  const lookup = useFacilityLookup(scope)
  const connect = useConnectFacility(scope)
  const [found, setFound] = useState<FacilityLookup | null>(null)
  const [searched, setSearched] = useState(false)
  const [badge, setBadge] = useState(requester?.badge ?? '')
  const [name, setName] = useState(requester?.name ?? '')
  const [code, setCode] = useState('')

  const search = () => {
    const wanted = number.trim()
    if (!wanted) return
    setFound(null)
    setSearched(false)
    lookup.mutate(
      { hqAddress: address, facilityNumber: wanted },
      {
        onSuccess: (result) => {
          setFound(result)
          setSearched(true)
        },
        onError: (error) =>
          t.error('Could not reach Head Office', { description: error instanceof ApiError ? error.message : 'Check the address and try again.' }),
      },
    )
  }

  const submit = () => {
    if (!found) return
    connect.mutate(
      { hqAddress: address, facilityNumber: number.trim(), requesterBadge: badge.trim(), requesterName: name.trim(), activationCode: code.trim() || undefined },
      {
        onSuccess: (result) => (result.state === 'connected' ? onConnected(result.facilityName) : onPending(result.facilityName)),
        onError: (error) => t.error('Could not connect', { description: error instanceof ApiError ? error.message : 'Please try again.' }),
      },
    )
  }

  const ready = found && badge.trim() && name.trim()

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex w-fit max-w-full items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        <span className="truncate">{address}</span>
      </button>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          search()
        }}
      >
        <Field className="flex-1">
          <FieldLabel>Facility ID or number</FieldLabel>
          <Input
            autoFocus
            value={number}
            onChange={(event) => {
              onNumberChange(event.target.value)
              setFound(null)
              setSearched(false)
            }}
            placeholder="e.g. UPS-001"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={!number.trim() || lookup.isPending}>
          <HugeiconsIcon icon={Search01Icon} size={14} />
          {lookup.isPending ? 'Looking…' : 'Look up'}
        </Button>
      </form>

      {searched && !found && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          <p>Head Office has no facility with that number. Check it, or ask Head Office to add the facility to its roster.</p>
          {onRegisterNew && (
            <Button type="button" size="xs" variant="secondary" className="w-fit" onClick={onRegisterNew}>
              Register it with a pairing code instead
            </Button>
          )}
        </div>
      )}

      {found && (
        <>
          <FacilityCard facility={found} />
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            {lockRequester ? (
              <p className="text-xs text-muted-foreground">
                Requested by <span className="font-medium text-foreground">{name}</span> ({badge})
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Your badge number</FieldLabel>
                  <Input value={badge} onChange={(event) => setBadge(event.target.value)} autoComplete="username" />
                </Field>
                <Field>
                  <FieldLabel>Your full name</FieldLabel>
                  <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                </Field>
              </div>
            )}
            <Field>
              <FieldLabel>Activation code (optional)</FieldLabel>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="8 digits from Head Office"
                autoComplete="one-time-code"
                inputMode="numeric"
                className="font-mono"
              />
              <FieldDescription>With a valid code you connect straight away. Without one, Head Office approves the request.</FieldDescription>
            </Field>
            <Button type="submit" disabled={!ready || connect.isPending} className="w-full">
              {connect.isPending ? 'Connecting…' : code.trim() ? 'Connect with code' : 'Request connection'}
            </Button>
          </form>
        </>
      )}
    </div>
  )
}

/** The facility is not on Head Office's roster: register it, with the pairing
 * code, the way this used to work. */
function DetailsStep({
  scope,
  pairingCode,
  facilityNumber,
  onBack,
  onConnected,
}: {
  scope: ConnectScope
  pairingCode: string
  facilityNumber: string
  onBack: () => void
  onConnected: (facilityName: string) => void
}) {
  const first = usePairWithHeadOffice()
  const later = usePairWithHeadOfficeLater()
  const pair = scope === 'onboarding' ? first : later

  const form = useAppForm({
    defaultValues: {
      name: '',
      facilityNumber,
      location: '',
      region: '' as RegisterFacilityInput['region'],
      headOfficerName: '',
    } as RegisterFacilityInput,
    onSubmit: async ({ value }) => {
      try {
        await pair.mutateAsync({ pairingCode, input: value })
        onConnected(value.name)
      } catch (error) {
        t.error('Head Office could not register this facility', {
          description: error instanceof ApiError ? error.message : 'The pairing code may have been used or expired. Ask for a new one.',
        })
      }
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="-ml-1 flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        Back
      </button>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">{(f) => <f.input label="Facility name" autoComplete="organization" autoFocus />}</form.AppField>
        <form.AppField name="facilityNumber">{(f) => <f.input label="Facility ID or number" autoComplete="off" />}</form.AppField>
        <form.AppField name="location">{(f) => <f.input label="Location" autoComplete="address-level2" />}</form.AppField>
        <form.AppField name="region">
          {(f) => (
            <Field>
              <FieldLabel>Region</FieldLabel>
              <Select value={f.state.value} onValueChange={(value) => f.handleChange((value as never) ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {facilityRegions.map((region) => (
                      <SelectItem key={region} value={region}>
                        {region}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
        </form.AppField>
        <form.AppField name="headOfficerName">{(f) => <f.input label="Head officer's name" autoComplete="name" />}</form.AppField>
        <form.AppForm>
          <div className="*:w-full">
            <form.submit label={pair.isPending ? 'Registering…' : 'Register with Head Office'} />
          </div>
        </form.AppForm>
      </form>
    </div>
  )
}

export function ConnectedNote({ facilityName }: { facilityName: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-emerald-600" />
      Connected as {facilityName}
    </div>
  )
}
