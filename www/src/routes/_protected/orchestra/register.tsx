import { NativeSelect } from '@/components/native-select'
import { officeKindFor, officeKindLabel, officeKinds, typeLabel } from '@/data/orchestra'
import { registerInstitution } from '@/functions/orchestra.func'
import * as m from '@/paraglide/messages'
import { getLocale } from '@/paraglide/runtime'
import { Button } from '@pleadli/ui/button'
import { t } from '@pleadli/ui/goey-toaster'
import { Input } from '@pleadli/ui/input'
import { Segmented } from '@pleadli/ui/segmented'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_protected/orchestra/register')({
  component: RouteComponent,
})

const COUNTRIES = ['UG', 'KE', 'TZ', 'RW', 'BI', 'CD', 'SS'] as const
const PUBLIC_TYPES = ['police', 'dpp', 'courts', 'prisons'] as const
type Kind = 'institution' | 'practice'

function countryName(code: string) {
  try {
    return new Intl.DisplayNames([getLocale()], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

const field = 'flex flex-col gap-1.5'

/** Registering is a request: what an institution says it is, how to reach it
 * to confirm, and its first offices. Staff confirm before any address. */
function RouteComponent() {
  const navigate = useNavigate()
  const [kind, setKind] = useState<Kind>('institution')
  const [type, setType] = useState<string>('police')
  const [name, setName] = useState('')
  const [country, setCountry] = useState<string>('UG')
  const [district, setDistrict] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [offices, setOffices] = useState<{ name: string; kind: string }[]>([])
  const [busy, setBusy] = useState(false)
  const institutionType = kind === 'practice' ? 'lawyers' : type

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { id } = await registerInstitution({
        data: { kind, institutionType, name, country, district: district || undefined, contactEmail: email, contactPhone: phone, offices: offices.filter((o) => o.name.trim().length >= 2) },
      })
      t.success(m["orch.reg.sent"]())
      void navigate({ to: '/orchestra/$orgId', params: { orgId: id } })
    } catch (e) {
      t.error(m["orch.reg.failed"](), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="container flex flex-col gap-8 py-16 md:max-w-2xl">
      <header className="flex flex-col gap-2">
        <Link to="/" className="flex w-fit items-center gap-2 text-sm font-bold">
          <img src="/favicon.svg" alt="" className="size-6" />
          {m["orch.name"]()}
        </Link>
        <h1 className="text-3xl! tracking-tight">{m["orch.reg.title"]()}</h1>
        <p>{m["orch.reg.lead"]()}</p>
      </header>

      <form onSubmit={submit} className="flex flex-col gap-6">
        <div className={field}>
          <span className="text-sm font-medium">{m["orch.reg.who"]()}</span>
          <Segmented
            label={m["orch.reg.who"]()}
            value={kind}
            onChange={(k) => {
              setKind(k)
              setOffices([])
            }}
            items={[
              { value: 'institution', label: m["orch.kind.institution"]() },
              { value: 'practice', label: m["orch.kind.practice"]() },
            ]}
          />
        </div>

        {kind === 'institution' && (
          <label className={field}>
            <span className="text-sm font-medium">{m["orch.reg.type"]()}</span>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value)}>
              {PUBLIC_TYPES.map((p) => (
                <option key={p} value={p}>
                  {typeLabel(p)}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}

        <label className={field}>
          <span className="text-sm font-medium">{m["orch.reg.name"]()}</span>
          <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
          <span className="text-xs text-muted-foreground">{kind === 'practice' ? m["orch.reg.name_hint_practice"]() : m["orch.reg.name_hint_institution"]()}</span>
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={field}>
            <span className="text-sm font-medium">{m["orch.reg.country"]()}</span>
            <NativeSelect value={country} onChange={(e) => setCountry(e.target.value)}>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {countryName(c)}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className={field}>
            <span className="text-sm font-medium">{m["orch.reg.district"]()}</span>
            <Input value={district} onChange={(e) => setDistrict(e.target.value)} />
          </label>
          <label className={field}>
            <span className="text-sm font-medium">{m["orch.reg.email"]()}</span>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={field}>
            <span className="text-sm font-medium">{m["orch.reg.phone"]()}</span>
            <Input required type="tel" minLength={6} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">{m["orch.reg.phone_hint"]()}</p>

        {kind === 'institution' && (
          <div className={field}>
            <span className="text-sm font-medium">{m["orch.reg.offices"]()}</span>
            <span className="text-xs text-muted-foreground">{m["orch.reg.offices_hint"]()}</span>
            {offices.map((office, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder={m["orch.reg.office_name"]()} value={office.name} onChange={(e) => setOffices(offices.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))} />
                <NativeSelect value={office.kind} onChange={(e) => setOffices(offices.map((o, j) => (j === i ? { ...o, kind: e.target.value } : o)))}>
                  {officeKinds.map((k) => (
                    <option key={k} value={k}>
                      {officeKindLabel(k)}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="button" variant="ghost" onClick={() => setOffices(offices.filter((_, j) => j !== i))}>
                  {m["orch.reg.remove"]()}
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" className="w-fit" onClick={() => setOffices([...offices, { name: '', kind: officeKindFor[type] ?? 'office' }])}>
              {m["orch.reg.add_office"]()}
            </Button>
          </div>
        )}

        <Button type="submit" size="lg" className="w-fit" disabled={busy}>
          {m["orch.reg.submit"]()}
        </Button>
      </form>
    </article>
  )
}
