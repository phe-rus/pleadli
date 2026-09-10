import { getAttachmentRoute } from '@/features/attachments'
import { openVaultEntry, revealVaultEntry, useVaultDirectory } from '@/features/files'
import { formatFileSize, pathSegments, type VaultEntry } from '@/features/files/schema'
import { entityTypeLabel } from '@/features/search'
import {
  ArrowUp01Icon,
  ExternalLinkIcon,
  File01Icon,
  Folder01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button, buttonVariants } from '@pleadli/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@pleadli/ui/components/breadcrumb'
import { t } from '@pleadli/ui/goey-toaster'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Fragment, useMemo } from 'react'

export const Route = createFileRoute('/_public/search/files')({
  validateSearch: (search: Record<string, unknown>): { path: string } => ({
    path: typeof search.path === 'string' ? search.path : '',
  }),
  component: RouteComponent,
})

function OpenRecordButton({ entry }: { entry: VaultEntry }) {
  const navigate = useNavigate()
  if (!entry.entityType || !entry.entityId) return null
  return (
    <Button
      type="button"
      size="icon-xs"
      variant="ghost"
      aria-label="Open the record this file belongs to"
      title="Open record"
      onClick={async (event) => {
        event.stopPropagation()
        try {
          const route = await getAttachmentRoute(entry.entityType!, entry.entityId!)
          navigate({ to: route } as never)
        } catch {
          t.error('Could not open the record this file belongs to')
        }
      }}
    >
      <HugeiconsIcon icon={ViewIcon} />
    </Button>
  )
}

function RouteComponent() {
  const { path } = Route.useSearch()
  const { data: entries } = useVaultDirectory(path)
  const crumbs = pathSegments(path)

  const columns: DataTableColumnDef<VaultEntry>[] = useMemo(() => {
    return [
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => {
          const entry = row.original
          if (entry.isDir) {
            return (
              <Link
                to="/search/files"
                search={{ path: entry.relativePath }}
                className="flex min-w-0 items-center gap-2 hover:underline"
              >
                <HugeiconsIcon icon={Folder01Icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{entry.name}</span>
              </Link>
            )
          }
          return (
            <button
              type="button"
              className="flex min-w-0 items-center gap-2 text-left hover:underline"
              onClick={() => openVaultEntry(entry)}
            >
              <HugeiconsIcon icon={File01Icon} className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{entry.name}</span>
            </button>
          )
        },
      },
      {
        accessorKey: 'entityType',
        header: 'Record',
        cell: ({ row }) =>
          row.original.entityType ? (
            <Badge variant="secondary">{entityTypeLabel(row.original.entityType)}</Badge>
          ) : (
            '·'
          ),
      },
      {
        accessorKey: 'sizeBytes',
        header: 'Size',
        cell: ({ row }) => (row.original.isDir ? '·' : formatFileSize(row.original.sizeBytes ?? 0)),
      },
      {
        accessorKey: 'modifiedAt',
        header: 'Modified',
        cell: ({ row }) => (row.original.modifiedAt ? new Date(row.original.modifiedAt).toLocaleString() : '·'),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const entry = row.original
          if (entry.isDir) return null
          return (
            <div className="flex items-center gap-1">
              <OpenRecordButton entry={entry} />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Reveal in folder"
                title="Reveal in folder"
                onClick={(event) => {
                  event.stopPropagation()
                  revealVaultEntry(entry)
                }}
              >
                <HugeiconsIcon icon={ExternalLinkIcon} />
              </Button>
            </div>
          )
        },
      },
    ]
  }, [])

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col">
        <h1>Files</h1>
        <p className="md:max-w-lg">
          The Police Vault itself. Every record generates its own folder here, on this device's Documents, and
          every file attached anywhere in the app lives in the matching one.
        </p>
      </section>

      <div className="flex items-center gap-3">
        {crumbs.length > 0 && (
          <Link
            to="/search/files"
            search={{ path: crumbs.slice(0, -1).map((c) => c.label).join('/') }}
            className={cn(buttonVariants({ size: 'icon-sm', variant: 'ghost' }))}
            aria-label="Up one level"
            title="Up one level"
          >
            <HugeiconsIcon icon={ArrowUp01Icon} />
          </Link>
        )}

        <Breadcrumb>
          <BreadcrumbList>
            <Fragment>
              <BreadcrumbItem>
                {crumbs.length === 0 ? (
                  <BreadcrumbPage>Police Vault</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink render={<Link to="/search/files" search={{ path: '' }}>Police Vault</Link>} />
                )}
              </BreadcrumbItem>
              {crumbs.length > 0 && <BreadcrumbSeparator />}
            </Fragment>
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <Fragment key={crumb.path}>
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={<Link to="/search/files" search={{ path: crumb.path }}>{crumb.label}</Link>} />
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <DataTable
        aria-label="Vault folder contents"
        data={entries ?? []}
        columns={columns}
        getRowId={(row) => row.relativePath}
        emptyMessage="This folder is empty."
        searchPlaceholder="Search this folder…"
      />
    </article>
  )
}
