import { Children, isValidElement, useState, type ChangeEvent, type ReactElement, type ReactNode } from 'react'
import { cn } from '@pleadli/ui/lib/utils'
import * as m from '@/paraglide/messages'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pleadli/ui/select'

/** A choice from a short list, drawn with the design system's Select instead of
 * the operating system's. It takes the same `<option>` children and the same
 * `onChange(e) => e.target.value` as a native `<select>`, so a form states its
 * choices the plain way and every list looks and behaves the same. */

const EMPTY = '__none__'
const encode = (v: string) => (v === '' ? EMPTY : v)
const decode = (v: string) => (v === EMPTY ? '' : v)

type Option = { value: string; label: ReactNode; disabled?: boolean }

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node as ReactElement<{ children?: ReactNode }>).props.children)
  return ''
}

function collect(children: ReactNode, out: Option[] = []): Option[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const el = child as ReactElement<{ value?: string | number; children?: ReactNode; disabled?: boolean }>
    if (el.type === 'option') out.push({ value: String(el.props.value ?? textOf(el.props.children)), label: el.props.children, disabled: el.props.disabled })
    else if (el.props?.children) collect(el.props.children, out)
  })
  return out
}

/** Only sizing is taken from a call site's classes; the look comes from the Select. */
const sizing = (className?: string) => (className ?? '').split(/\s+/).filter((c) => /^(sm:|md:|lg:)?(w-|min-w-|max-w-|flex-|grow|shrink)/.test(c)).join(' ')

type Props = {
  value?: string
  defaultValue?: string
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
  children?: ReactNode
  className?: string
  disabled?: boolean
  id?: string
  name?: string
  required?: boolean
  'aria-label'?: string
}

export function ChoiceSelect({ value, defaultValue, onChange, children, className, disabled, id, 'aria-label': ariaLabel }: Props) {
  const [own, setOwn] = useState(defaultValue ?? '')
  const current = value ?? own
  // An empty choice has no words of its own; it says so rather than showing the internal marker.
  const options = collect(children).map((o) => (o.value === '' && textOf(o.label) === '' ? { ...o, label: m['choice.none']() } : o))
  const choose = (next: string | null) => {
    const v = decode(next ?? '')
    if (value === undefined) setOwn(v)
    onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)
  }
  return (
    <Select items={options.map((o) => ({ value: encode(o.value), label: o.label }))} value={encode(current)} onValueChange={choose} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn('min-w-0', sizing(className))}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={encode(o.value)} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
