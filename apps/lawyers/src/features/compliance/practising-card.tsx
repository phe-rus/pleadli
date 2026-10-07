import { SettingsCard, SettingsRow } from '@/components/settings-card'
import { Tag, type Tone } from '@/components/status-tag'
import { useSessionStatus } from '@/features/installation'
import { messageOf } from '@/lib/api'
import { fromDateInput, toIsoDay } from '@/lib/day'
import * as m from '@/paraglide/messages'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { complianceOptions, useSaveCompliance, type CertificateState } from './data'

const certificateTone: Record<CertificateState, Tone> = { missing: 'planned', valid: 'done', soon: 'open', expired: 'urgent' }

export const certificateLabel = (state: CertificateState) =>
  ({ missing: m["compliance.cert.missing"], valid: m["compliance.cert.valid"], soon: m["compliance.cert.soon"], expired: m["compliance.cert.expired"] })[state]()

export function CertificateTag({ state }: { state: CertificateState }) {
  return <Tag tone={certificateTone[state]}>{certificateLabel(state)}</Tag>
}

const day = (ms: number | null) => (ms ? toIsoDay(ms) : '')


/** The signed-in advocate's own practising details. The register checks
 * them, and the Statistics page shows everyone's. */
export function PractisingCard() {
  const { data: status } = useSessionStatus()
  const actor = status?.actor
  const queryClient = useQueryClient()
  const { data } = useQuery({ ...complianceOptions(), enabled: actor?.role === 'advocate' })
  const save = useSaveCompliance()
  const mine = data?.advocates.find((a) => a.staffId === actor?.id)
  const [number, setNumber] = useState('')
  const [expires, setExpires] = useState('')
  const [uls, setUls] = useState('')
  const [commissioner, setCommissioner] = useState('')
  const [notary, setNotary] = useState('')

  useEffect(() => {
    if (!mine) return
    setNumber(mine.practisingNumber ?? '')
    setExpires(day(mine.certificateExpiresOn))
    setUls(mine.ulsPaidYear ? String(mine.ulsPaidYear) : '')
    setCommissioner(day(mine.commissionerSince))
    setNotary(day(mine.notarySince))
  }, [mine])

  if (actor?.role !== 'advocate' || !mine) return null
  return (
    <SettingsCard
      title={m["compliance.card_title"]()}
      badge={<CertificateTag state={mine.certificate} />}
      description={m["compliance.card_description"]()}
      hint={m["compliance.card_hint"]()}
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await save.mutateAsync({
            staffId: mine.staffId,
            input: {
              practisingNumber: number.trim() || null,
              certificateExpiresOn: fromDateInput(expires),
              ulsPaidYear: uls ? Number(uls) : null,
              commissionerSince: fromDateInput(commissioner),
              notarySince: fromDateInput(notary),
            },
          })
          await queryClient.invalidateQueries({ queryKey: ['compliance'] })
          await queryClient.invalidateQueries({ queryKey: ['registers'] })
          t.success(m["settings.saved"]())
        } catch (error) {
          t.error(m["settings.save_failed"](), { description: messageOf(error) })
        }
      }}
      action={
        <Button type="submit" size="sm" disabled={save.isPending}>
          {m["settings.save"]()}
        </Button>
      }
    >
      <SettingsRow label={m["compliance.number"]()}>{(id) => <Input id={id} value={number} onChange={(e) => setNumber(e.target.value)} />}</SettingsRow>
      <SettingsRow label={m["compliance.expires"]()} hint={m["compliance.expires_hint"]()}>
        {(id) => <Input id={id} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />}
      </SettingsRow>
      <SettingsRow label={m["compliance.uls"]()} hint={m["compliance.uls_hint"]()}>
        {(id) => <Input id={id} inputMode="numeric" maxLength={4} placeholder={String(new Date().getFullYear())} value={uls} onChange={(e) => setUls(e.target.value.replace(/\D/g, ''))} />}
      </SettingsRow>
      <SettingsRow label={m["compliance.commissioner"]()} hint={m["compliance.commissioner_hint"]()}>
        {(id) => <Input id={id} type="date" value={commissioner} onChange={(e) => setCommissioner(e.target.value)} />}
      </SettingsRow>
      <SettingsRow label={m["compliance.notary"]()} hint={m["compliance.notary_hint"]()}>
        {(id) => <Input id={id} type="date" value={notary} onChange={(e) => setNotary(e.target.value)} />}
      </SettingsRow>
    </SettingsCard>
  )
}
