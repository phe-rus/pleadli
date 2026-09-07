import { listUsersAdmin } from '@/functions/admin.func'
import { DataTable } from '@pleadli/forms-tables'
import { Avatar, AvatarFallback, AvatarImage } from '@pleadli/ui/avatar'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/admin/users')({
  loader: () => listUsersAdmin(),
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()

  return (
    <article className="container flex flex-col gap-5 py-10 md:max-w-5xl">
      <section>
        <h1>Users</h1>
        <p className="text-muted-foreground">Everyone with a Pleadli account.</p>
      </section>

      <DataTable
        aria-label='users'
        columns={[
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
            cell: ({ getValue }) => <Badge variant="outline">{getValue() ?? 'user'}</Badge>,
          },
          {
            accessorKey: 'banned',
            header: 'Status',
            cell: ({ getValue }) => getValue() ? (
              <Badge variant="destructive">Banned</Badge>
            ) : (
              <Badge variant="outline">Active</Badge>
            ),
          },
          {
            accessorFn: (row) => row.createdAt.toISOString(),
            header: 'Created At',
            cell: ({ getValue }) => new Date(getValue()).toLocaleString(),
          },
          {
            accessorFn: (row) => row.updatedAt.toISOString(),
            header: 'Updated At',
            cell: ({ getValue }) => new Date(getValue()).toLocaleString(),
          },
        ]}
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
      />
    </article>
  )
}
