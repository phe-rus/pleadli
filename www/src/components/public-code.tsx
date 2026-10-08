import { getLocale } from '@/paraglide/runtime'
import { Button } from '@pleadli/ui/button'
import { Field, FieldDescription, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

/** The code a visitor typed or scanned, kept in the address so a result can be
 * shared or reloaded. */
export const codeSearch = (s: Record<string, unknown>): { code?: string } =>
  typeof s.code === 'string' && s.code.trim() ? { code: s.code.trim().slice(0, 80) } : {}

/** A scanned paper QR reads "PLEADLI <reference> ABCD-EFGH-JKLM": the code is
 * the dashed group at the end. Anything else is taken as typed. */
function pickCode(text: string) {
  const dashed = text.trim().match(/[A-Za-z0-9]{4}(?:-[A-Za-z0-9]{4}){1,5}$/)
  return (dashed?.[0] ?? text).toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

export function formatDate(ms: number) {
  return new Intl.DateTimeFormat(getLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(ms)
}

export function CodeForm({ from, code, label, hint, submit }: { from: '/verify' | '/track'; code?: string; label: string; hint: string; submit: string }) {
  const navigate = useNavigate({ from })
  const [text, setText] = useState(code ?? '')

  return (
    <form
      className="flex flex-col gap-3 md:max-w-md"
      onSubmit={(e) => {
        e.preventDefault()
        const picked = pickCode(text)
        setText(picked)
        navigate({ search: picked ? { code: picked } : {} })
      }}
    >
      <Field>
        <FieldLabel htmlFor="code">{label}</FieldLabel>
        <div className="flex gap-2">
          <Input id="code" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono uppercase" />
          <Button type="submit">{submit}</Button>
        </div>
        <FieldDescription>{hint}</FieldDescription>
      </Field>
    </form>
  )
}
