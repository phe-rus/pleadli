import { useAttachmentDataUrl } from '@/features/attachments'
import { Avatar, AvatarFallback, AvatarImage } from '@pleadli/ui/avatar'

function initialsOf(name: string) {
  return name
    .split(' ')
    .map((part) => part.replace(/[^A-Za-z]/g, '')[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
}

export type PersonAvatarProps = {
  name: string
  headshotAttachmentId?: string | null
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

/** A person's designated headshot when one is set, initials otherwise —
 * the one place this app shows a photo of someone, used everywhere a
 * person is listed or opened. */
export function PersonAvatar({ name, headshotAttachmentId, size, className }: PersonAvatarProps) {
  const { data: dataUrl } = useAttachmentDataUrl(headshotAttachmentId)

  return (
    <Avatar size={size} className={className}>
      {dataUrl && <AvatarImage src={dataUrl} alt={name} />}
      <AvatarFallback className="bg-muted text-[0.625rem]">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  )
}
