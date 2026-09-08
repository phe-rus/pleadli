import { Avatar, AvatarFallback } from '@pleadli/ui/avatar'
import { cn } from '@pleadli/ui/lib/utils'
import type { SearchPerson } from '@/data/search'

export type PersonRowProps = {
  person: SearchPerson
  className?: string
}

const initialsOf = (name: string) =>
  name
    .split(' ')
    .map((part) => part.replace(/[^A-Za-z]/g, '')[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')

export const PersonRow = ({ person, className }: PersonRowProps) => {
  return (
    <article
      className={cn(
        'flex cursor-pointer items-center justify-between gap-3 rounded-md px-1.5 py-1 transition-colors hover:bg-muted/60',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar size="sm" className="shrink-0">
          <AvatarFallback className="bg-muted text-[0.625rem]">
            {initialsOf(person.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-xs">{person.name}</h1>
          <p className="text-xs text-muted-foreground">
            {person.id} · {person.role}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">{person.updated}</span>
    </article>
  )
}