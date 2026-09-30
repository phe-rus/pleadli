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
import { useConnectFacility, useDiscoverHeadOffice, useFacilityLookup, usePairWithHeadOffice, usePairWithHeadOfficeLater, useProbeHeadOffice } from './queries'
import { facilityRegions, facilityStatusLabel, type ConnectScope, type DiscoveredHq, type FacilityLookup, type HqIdentity, type RegisterFacilityInput } from './schema'
import { StepsProgress } from './steps-progress'
import { m } from '@/paraglide/messages'

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

export const connectSteps = () => [m.facilities_connect_step_head_office(), m.facilities_connect_step_your_facility(), m.facilities_connect_step_approval()]

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

type Step = 'address' | 'confirm' | 'facility' | 'details'

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
  // What the address turned out to be, once looked at. `fingerprint` is set only
  // for a local-network address, and only after a person confirmed it.
  const [identity, setIdentity] = useState<HqIdentity | null>(null)
  const [fingerprint, setFingerprint] = useState<string | undefined>(undefined)

  return (
    <div className="flex flex-col gap-6">
      <StepsProgress steps={connectSteps()} current={step === 'address' || step === 'confirm' ? 0 : 1} />
      {step === 'address' && (
        <AddressStep
          scope={scope}
          value={address}
          onChange={(value) => {
            setAddress(value)
            setFingerprint(undefined)
          }}
          onIdentified={(found) => {
            rememberAddress(found.address)
            // A pasted pairing code carries its secret after a '#': keep it.
            setAddress(address.includes('#') ? found.address + address.slice(address.lastIndexOf('#')) : found.address)
            setIdentity(found)
            if (found.fingerprint) {
              setStep('confirm')
            } else {
              setFingerprint(undefined)
              setStep('facility')
            }
          }}
          onSkip={onSkip}
        />
      )}
      {step === 'confirm' && identity && (
        <ConfirmStep
          identity={identity}
          onBack={() => setStep('address')}
          onConfirmed={() => {
            setFingerprint(identity.fingerprint ?? undefined)
            setStep('facility')
          }}
        />
      )}
      {step === 'facility' && (
        <FacilityStep
          scope={scope}
          address={address.trim()}
          fingerprint={fingerprint}
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
        <DetailsStep scope={scope} pairingCode={address.trim()} fingerprint={fingerprint} facilityNumber={number} onBack={() => setStep('facility')} onConnected={onConnected} />
      )}
    </div>
  )
}

/** The address of Head Office: typed, or picked from what a search of the local
 * network found. Either way it is only looked at (who answers, and which
 * certificate it presents); nothing is trusted or sent until a person confirms. */
function AddressStep({
  scope,
  value,
  onChange,
  onIdentified,
  onSkip,
}: {
  scope: ConnectScope
  value: string
  onChange: (value: string) => void
  onIdentified: (identity: HqIdentity) => void
  onSkip?: () => void
}) {
  const discover = useDiscoverHeadOffice(scope)
  const probe = useProbeHeadOffice(scope)
  const [found, setFound] = useState<DiscoveredHq[] | null>(null)

  const look = (address: string) =>
    probe.mutate(address.trim(), {
      onSuccess: onIdentified,
      onError: (error) => t.error(m.facilities_could_not_reach_head_office(), { description: error instanceof ApiError ? error.message : m.facilities_check_the_address_and_try_again() }),
    })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        look(value)
      }}
    >
      <Field>
        <FieldLabel>{m.facilities_head_office_address()}</FieldLabel>
        <Input
          autoFocus
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={m.facilities_https_hq_example_org_or_a()}
          autoComplete="url"
          inputMode="url"
          spellCheck={false}
          className="font-mono text-xs"
        />
        <FieldDescription>{m.facilities_the_address_head_office_gave_you()}</FieldDescription>
      </Field>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="secondary" className="w-full" disabled={discover.isPending} onClick={() => discover.mutate(undefined, { onSuccess: setFound })}>
          <HugeiconsIcon icon={Search01Icon} size={14} />
          {discover.isPending ? m.facilities_searching_the_network() : m.facilities_find_head_office_on_this_network()}
        </Button>
        {found?.length === 0 && <p>{m.facilities_no_head_office_answered()}</p>}
        {found?.map((candidate) => (
          <button
            key={candidate.address}
            type="button"
            onClick={() => {
              onChange(candidate.address)
              look(candidate.address)
            }}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-secondary/60"
          >
            <span className="truncate">{candidate.name}</span>
            <code className="shrink-0">{candidate.address}</code>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="submit" disabled={value.trim().length === 0 || probe.isPending} className="w-full">
          {probe.isPending ? m.facilities_checking_the_address() : m.facilities_continue()}
        </Button>
        {onSkip && (
          <Button type="button" variant="secondary" className="w-full" onClick={onSkip}>
            {m.facilities_continue_without_head_office()}
          </Button>
        )}
      </div>
    </form>
  )
}

/** The moment trust is decided: the certificate the address presented, for a
 * person to compare with the one Head Office shows on its own screen. */
function ConfirmStep({ identity, onBack, onConfirmed }: { identity: HqIdentity; onBack: () => void; onConfirmed: () => void }) {
  const groups = (identity.fingerprint ?? '').split(':')
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="-ml-1 flex w-fit items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground">
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        {m.facilities_back()}
      </button>
      <div className="flex flex-col gap-1">
        <h4>{m.facilities_confirm_head_office()}</h4>
        <p>{m.facilities_confirm_head_office_body({ name: identity.name, address: identity.address.replace('https://', '') })}</p>
      </div>
      <Field>
        <FieldLabel>{m.facilities_certificate_fingerprint()}</FieldLabel>
        <code className="grid grid-cols-8 gap-x-2 gap-y-1 rounded-lg border border-border bg-card p-3 text-xs" aria-label={identity.fingerprint ?? ''}>
          {groups.map((group, index) => (
            <span key={index}>{group}</span>
          ))}
        </code>
      </Field>
      <Button type="button" className="w-full" onClick={onConfirmed}>
        {m.facilities_it_matches_continue()}
      </Button>
    </div>
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
          <h4 className="truncate">{facility.name}</h4>
          <p className="truncate">
            {m.facilities_region_2({ location: facility.location, region: facility.region })}</p>
        </div>
        <Badge variant={facility.status === 'active' ? 'default' : 'secondary'}>{facilityStatusLabel(facility.status)}</Badge>
      </div>
      {facility.status === 'active' && (
        <p>
          {m.facilities_another_installation_is_already_connecte()}
        </p>
      )}
    </div>
  )
}

function FacilityStep({
  scope,
  address,
  fingerprint,
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
  fingerprint?: string
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
      { hqAddress: address, facilityNumber: wanted, hqFingerprint: fingerprint },
      {
        onSuccess: (result) => {
          setFound(result)
          setSearched(true)
        },
        onError: (error) =>
          t.error(m.facilities_could_not_reach_head_office(), { description: error instanceof ApiError ? error.message : m.facilities_check_the_address_and_try_again() }),
      },
    )
  }

  const submit = () => {
    if (!found) return
    connect.mutate(
      { hqAddress: address, facilityNumber: number.trim(), requesterBadge: badge.trim(), requesterName: name.trim(), activationCode: code.trim() || undefined, hqFingerprint: fingerprint },
      {
        onSuccess: (result) => (result.state === 'connected' ? onConnected(result.facilityName) : onPending(result.facilityName)),
        onError: (error) => t.error(m.facilities_could_not_connect(), { description: error instanceof ApiError ? error.message : m.facilities_please_try_again() }),
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
          <FieldLabel>{m.facilities_facility_id_or_number()}</FieldLabel>
          <Input
            autoFocus
            value={number}
            onChange={(event) => {
              onNumberChange(event.target.value)
              setFound(null)
              setSearched(false)
            }}
            placeholder={m.facilities_e_g_ups_001()}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={!number.trim() || lookup.isPending}>
          <HugeiconsIcon icon={Search01Icon} size={14} />
          {lookup.isPending ? m.facilities_looking() : m.facilities_look_up()}
        </Button>
      </form>

      {searched && !found && (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <p>{m.facilities_head_office_has_no_facility_with()}</p>
          {onRegisterNew && (
            <Button type="button" size="xs" variant="secondary" className="w-fit" onClick={onRegisterNew}>
              {m.facilities_register_it_with_a_pairing_code()}
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
              <p>
                {m.facilities_requested_by()} <strong className="text-foreground">{name}</strong> ({badge})
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>{m.facilities_your_badge_number()}</FieldLabel>
                  <Input value={badge} onChange={(event) => setBadge(event.target.value)} autoComplete="username" />
                </Field>
                <Field>
                  <FieldLabel>{m.facilities_your_full_name()}</FieldLabel>
                  <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
                </Field>
              </div>
            )}
            <Field>
              <FieldLabel>{m.facilities_activation_code_optional()}</FieldLabel>
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={m.facilities_8_digits_from_head_office()}
                autoComplete="one-time-code"
                inputMode="numeric"
                className="font-mono"
              />
              <FieldDescription>{m.facilities_with_a_valid_code_you_connect()}</FieldDescription>
            </Field>
            <Button type="submit" disabled={!ready || connect.isPending} className="w-full">
              {connect.isPending ? m.facilities_connecting() : code.trim() ? m.facilities_connect_with_code() : m.facilities_request_connection()}
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
  fingerprint,
  facilityNumber,
  onBack,
  onConnected,
}: {
  scope: ConnectScope
  pairingCode: string
  fingerprint?: string
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
        await pair.mutateAsync({ pairingCode, input: value, hqFingerprint: fingerprint })
        onConnected(value.name)
      } catch (error) {
        t.error(m.facilities_head_office_could_not_register_this(), {
          description: error instanceof ApiError ? error.message : m.facilities_the_pairing_code_may_have_been(),
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
        {m.facilities_back()}
      </button>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          form.handleSubmit()
        }}
      >
        <form.AppField name="name">{(f) => <f.input label={m.facilities_facility_name()} autoComplete="organization" autoFocus />}</form.AppField>
        <form.AppField name="facilityNumber">{(f) => <f.input label={m.facilities_facility_id_or_number()} autoComplete="off" />}</form.AppField>
        <form.AppField name="location">{(f) => <f.input label={m.facilities_location()} autoComplete="address-level2" />}</form.AppField>
        <form.AppField name="region">
          {(f) => (
            <Field>
              <FieldLabel>{m.facilities_region()}</FieldLabel>
              <Select value={f.state.value} onValueChange={(value) => f.handleChange((value as never) ?? f.state.value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.facilities_select_region()} />
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
        <form.AppField name="headOfficerName">{(f) => <f.input label={m.facilities_head_officer_s_name()} autoComplete="name" />}</form.AppField>
        <form.AppForm>
          <div className="*:w-full">
            <form.submit label={pair.isPending ? m.facilities_registering() : m.facilities_register_with_head_office()} />
          </div>
        </form.AppForm>
      </form>
    </div>
  )
}

export function ConnectedNote({ facilityName }: { facilityName: string }) {
  return (
    <div className="flex items-center gap-2">
      <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} className="text-emerald-600" />
      {m.facilities_connected_as({ facilityName })}</div>
  )
}
