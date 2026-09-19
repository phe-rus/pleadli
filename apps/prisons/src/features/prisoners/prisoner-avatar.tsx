import { getAttachmentDataUrl } from '@/features/attachments/data'
import { usePrisonerPhotosQuery } from '@/features/prisoner-photos/queries'
import type { PhotoView } from '@/features/prisoner-photos/schema'
import { cn } from '@pleadli/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'

const sizes = { xs: 'size-6 text-[9px]', sm: 'size-8 text-[11px]', md: 'size-10 text-xs', lg: 'size-16 text-base', xl: 'size-28 text-2xl' } as const

function initialsOf(name: string) {
  const parts = name.replace(/,/g, ' ').split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?'
}

/** A prisoner's photo, or their initials when none has been taken. Photos and
 * their bytes are cached by react-query, so a list of avatars does not
 * refetch as it re-renders. */
export function PrisonerAvatar({
  prisonerId,
  name,
  size = 'md',
  className,
  view = 'front',
}: {
  prisonerId: string
  name: string
  /** A named size, or a pixel size. */
  size?: keyof typeof sizes | number
  className?: string
  view?: PhotoView
}) {
  const photos = usePrisonerPhotosQuery(prisonerId)
  const attachmentId = photos.data?.find((photo) => photo.view === view)?.attachmentId
  const image = useQuery({
    queryKey: ['attachment-data-url', attachmentId] as const,
    queryFn: () => getAttachmentDataUrl(attachmentId as string),
    enabled: Boolean(attachmentId),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  })

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground', typeof size === 'string' && sizes[size], className)}
      style={typeof size === 'number' ? { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) } : undefined}
    >
      {image.data ? <img src={image.data} alt={name} className="size-full object-cover" /> : initialsOf(name)}
    </span>
  )
}
