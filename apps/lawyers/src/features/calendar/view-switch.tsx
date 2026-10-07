import * as m from '@/paraglide/messages'
import { Segmented } from '@pleadli/ui/segmented'
import { Link } from '@tanstack/react-router'

/** Day or Month, as Apple Calendar switches them: one place, two ways of
 * seeing it. The day is the diary, where a hearing is closed; the month is for
 * seeing what is coming. */
export function CalendarViewSwitch({ value }: { value: 'day' | 'month' }) {
  return (
    <Segmented
      label={m["cal.views"]()}
      value={value}
      size="sm"
      items={[
        { value: 'day', label: m["cal.day"]() },
        { value: 'month', label: m["cal.month"]() },
      ]}
      render={(item, props) => (
        <Link key={item.value} to={item.value === 'day' ? '/diary' : '/calendar'} replace className={props.className} role={props.role} aria-selected={props['aria-selected']}>
          {props.children}
        </Link>
      )}
    />
  )
}
