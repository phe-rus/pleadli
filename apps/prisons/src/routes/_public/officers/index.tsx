import { Createpanel } from '@/components/create-panel'
import { useFacilities, useFacilityOfficers, type FacilityOfficer } from '@/features/facilities'
import { FacilityOfficerProfile, OfficerAvatar, OfficerForm, OfficerProfile, officerRoleLabel, useOfficers, type Officer } from '@/features/officers'
import { useHqConfig, usePermissions } from '@/features/session'
import { AddCircleIcon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/_public/officers/')({
  component: RouteComponent,
})

/** Accounts of this installation. The node decides who may manage them
 * (`accounts.manage`); this page only asks and shows what it is told. */
function RouteComponent() {
  const { data: config } = useHqConfig()
  const { can, session } = usePermissions()

  return (
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <section className="flex flex-col gap-1">
        <h1>Accounts</h1>
        <p className="md:max-w-lg">
          {config?.isHeadOffice
            ? 'Every account in Head Office, and the officers of each connected facility. Deleting an account keeps its audit history under the badge number and name.'
            : 'Officer accounts for this facility. Accounts are deactivated, never deleted, so every record still shows who acted.'}
        </p>
      </section>

      {session &&
        (can('accounts.manage') ? (
          config?.isHeadOffice ? <HeadOfficeAccounts /> : <AccountsPanel headOffice={false} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
            <HugeiconsIcon icon={ShieldKeyIcon} size={20} />
            <p className="text-sm">Only an administrator can manage accounts.</p>
          </div>
        ))}
    </article>
  )
}

function HeadOfficeAccounts() {
  return (
    <Tabs defaultValue="accounts">
      <TabsList variant="line">
        <TabsTrigger value="accounts">Head Office accounts</TabsTrigger>
        <TabsTrigger value="facility-officers">Facility officers</TabsTrigger>
      </TabsList>
      <TabsContent value="accounts" className="pt-4">
        <AccountsPanel headOffice />
      </TabsContent>
      <TabsContent value="facility-officers" className="pt-4">
        <FacilityOfficersPanel />
      </TabsContent>
    </Tabs>
  )
}

function AccountsPanel({ headOffice }: { headOffice: boolean }) {
  const [addOpen, setAddOpen] = useState(false)
  const [viewing, setViewing] = useState<Officer | null>(null)
  const [editing, setEditing] = useState<Officer | null>(null)
  const { data: officers } = useOfficers(true)
  const { data: facilities } = useFacilities(headOffice)
  const facilityNames = useMemo(() => new Map((facilities ?? []).map((f) => [f.id, f.name])), [facilities])
  const current = viewing ? (officers?.find((o) => o.id === viewing.id) ?? viewing) : null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-4">
        <Createpanel
          open={addOpen}
          onOpenChange={setAddOpen}
          trigger={
            <Button size="sm">
              <HugeiconsIcon icon={AddCircleIcon} />
              Add account
            </Button>
          }
          headings={{ title: 'Add account', description: 'Create a new account for this installation.' }}
        >
          <OfficerForm onSuccess={() => setAddOpen(false)} />
        </Createpanel>
      </div>

      <Createpanel
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
        }}
        headings={{ title: 'Account', description: 'Profile and recent activity.' }}
      >
        {current && (
          <OfficerProfile
            key={current.id}
            officer={current}
            headOffice={headOffice}
            onEdit={() => {
              setEditing(current)
              setViewing(null)
            }}
          />
        )}
      </Createpanel>

      <Createpanel
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        headings={{ title: 'Edit account', description: 'Update this account.' }}
      >
        {editing && <OfficerForm key={editing.id} officer={editing} onSuccess={() => setEditing(null)} />}
      </Createpanel>

      <OfficersTable officers={officers ?? []} facilityNames={facilityNames} headOffice={headOffice} onSelect={setViewing} />
    </div>
  )
}

function OfficersTable({
  officers,
  facilityNames,
  headOffice,
  onSelect,
}: {
  officers: Officer[]
  facilityNames: Map<string, string>
  headOffice: boolean
  onSelect: (officer: Officer) => void
}) {
  const columns: DataTableColumnDef<Officer>[] = useMemo(
    () => [
      selectColumn(),
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ row }) => (
          <span className={cn('rounded-md bg-primary/15 px-3 py-1 text-xs', 'cursor-pointer')} onClick={() => onSelect(row.original)}>
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <button type="button" className="flex items-center gap-2 text-left" onClick={() => onSelect(row.original)}>
            <OfficerAvatar officer={row.original} size={24} />
            {row.original.name}
          </button>
        ),
      },
      { accessorKey: 'badgeNumber', header: 'Badge number' },
      { accessorKey: 'rank', header: 'Rank', cell: ({ getValue }) => getValue<string | null>() ?? '' },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <Badge variant="secondary">{officerRoleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: 'isAdmin',
        header: 'Administrator',
        cell: ({ row }) => (row.original.isAdmin ? <Badge>Administrator</Badge> : <span className="text-muted-foreground">No</span>),
      },
      {
        accessorKey: 'active',
        header: 'Status',
        cell: ({ row }) => <Badge variant={row.original.active ? 'default' : 'secondary'}>{row.original.active ? 'Active' : 'Disabled'}</Badge>,
      },
      { accessorKey: 'phone', header: 'Phone', cell: ({ getValue }) => getValue<string | null>() ?? '' },
      { accessorKey: 'email', header: 'Email', cell: ({ getValue }) => getValue<string | null>() ?? '' },
      ...(headOffice
        ? [
            {
              accessorKey: 'postedFacilityId',
              header: 'Posted facility',
              cell: ({ row }: { row: { original: Officer } }) =>
                row.original.postedFacilityId
                  ? (facilityNames.get(row.original.postedFacilityId) ?? row.original.postedFacilityId)
                  : '',
            } satisfies DataTableColumnDef<Officer>,
          ]
        : []),
      {
        accessorKey: 'lastLoginAt',
        header: 'Last sign-in',
        cell: ({ getValue }) => {
          const value = getValue<number | null>()
          return value ? format(value, 'PPp') : 'Never'
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Added',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ],
    [onSelect, facilityNames, headOffice],
  )

  return (
    <DataTable
      aria-label="Officers"
      data={officers}
      columns={columns}
      getRowId={(row) => row.id}
      emptyMessage="No officers added yet."
      searchPlaceholder="Search by name or badge number…"
    />
  )
}

/** Read-only directory of the officers each connected facility has reported
 * to Head Office. Head Office manages its own accounts above; a facility's
 * accounts are managed at the facility. */
function FacilityOfficersPanel() {
  const { data: officers } = useFacilityOfficers()
  const [viewing, setViewing] = useState<FacilityOfficer | null>(null)

  const columns: DataTableColumnDef<FacilityOfficer>[] = useMemo(
    () => [
      selectColumn(),
      {
        id: 'badge',
        accessorKey: 'badgeNumber',
        header: 'Badge number',
        cell: ({ row }) => (
          <span className="cursor-pointer rounded-md bg-primary/15 px-3 py-1 text-xs" onClick={() => setViewing(row.original)}>
            {row.original.badgeNumber}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <button type="button" className="flex items-center gap-2 text-left" onClick={() => setViewing(row.original)}>
            <OfficerAvatar officer={{ name: row.original.name }} size={24} />
            {row.original.name}
          </button>
        ),
      },
      { accessorKey: 'facilityName', header: 'Facility' },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => <Badge variant="secondary">{officerRoleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: 'isAdmin',
        header: 'Administrator',
        cell: ({ row }) => (row.original.isAdmin ? <Badge>Administrator</Badge> : <span className="text-muted-foreground">No</span>),
      },
      {
        accessorKey: 'active',
        header: 'Status',
        cell: ({ row }) => <Badge variant={row.original.active ? 'default' : 'secondary'}>{row.original.active ? 'Active' : 'Disabled'}</Badge>,
      },
      {
        accessorKey: 'syncedAt',
        header: 'Last pushed',
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-4">
      <Createpanel
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
        }}
        headings={{ title: 'Facility officer', description: 'As reported to Head Office. Read-only here.' }}
      >
        {viewing && <FacilityOfficerProfile key={`${viewing.facilityId}:${viewing.badgeNumber}`} officer={viewing} />}
      </Createpanel>

      <DataTable
        aria-label="Facility officers"
        data={officers ?? []}
        columns={columns}
        getRowId={(row) => `${row.facilityId}:${row.badgeNumber}`}
        emptyMessage="No connected facility has reported its officers yet."
        searchPlaceholder="Search by name, badge or facility…"
      />
    </div>
  )
}
