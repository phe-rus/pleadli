import { listUsersAdmin } from '@/functions/admin.func'
import { UserManagementDrawer } from '@/components/admin/user-management-drawer'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Avatar, AvatarFallback, AvatarImage } from '@pleadli/ui/avatar'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_protected/admin/users')({
  loader: () => listUsersAdmin(),
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()
  const [manageUser, setManageUser] = useState<(typeof data)[number] | null>(null)

  const columns: DataTableColumnDef<(typeof data)[number]>[] = useMemo(() => [
    {
      accessorKey: "id",
      header: "ID",
      cell: ({ row }) => {
        const id = row.original.id
        return (
          <span
            className={cn(
              "rounded bg-accent px-3 py-1 text-[9px]!",
              "cursor-pointer"
            )}
          >
            {id}
          </span>
        )
      },
    },
    {
      accessorKey: 'image',
      header: 'Avatar',
      cell: ({ row }) => {
        return (
          <Avatar size='sm' className="size-4.5!">
            <AvatarImage src={row.original.image ?? '/avatar/orange.jpg'} />
            <AvatarFallback className='text-[7px]!'>
              {row.original.name.slice(0, 2).toUpperCase() ?? '??'}
            </AvatarFallback>
          </Avatar>
        )
      }
    },
    {
      accessorKey: 'email',
      header: 'Email',
    },
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.role ?? 'user'}</Badge>
      ),
    },
    {
      accessorKey: 'banned',
      header: 'Status',
      cell: ({ row }) => (
        row.original.banned ? (
          <Badge variant="destructive">Banned</Badge>
        ) : (
          <Badge variant="outline">Active</Badge>
        )
      ),
    },
    {
      header: 'Created At',
      accessorFn: (row) => row.createdAt.toISOString(),
      cell: ({ row }) => (
        <time dateTime={row.original.createdAt.toISOString()}>
          {format(row.original.createdAt, 'PPPp')}
        </time>
      )
    },
    {
      header: 'Actions',
      id: 'actions',
      cell: ({ row }) => (
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setManageUser(row.original)}
        >
          Manage
        </Button>
      ),
    },
  ], [])

  return (
    <article className="container flex flex-col gap-5 py-10 md:max-w-5xl">
      <section>
        <h1>Users</h1>
        <p className="text-muted-foreground">Everyone with a Pleadli account.</p>
      </section>

      <DataTable
        aria-label='users'
        columns={columns}
        data={data}
        getRowId={(row) => row.id}
        emptyMessage="No members yet."
        searchPlaceholder="Search by name or email…"
        bulkActions={(selectedRows, clearSelection) => (
          <Button
            type="button"
            variant="destructive"
            size="xs"
            onClick={() => {
              console.log(selectedRows)
              clearSelection()
            }}
          >
            Remove selected
          </Button>
        )}
        onSelectedRowsChange={({ }) => { }}
      />

      {manageUser && (
        <UserManagementDrawer
          user={manageUser}
          onClose={() => setManageUser(null)}
        />
      )}
    </article>
  )
}