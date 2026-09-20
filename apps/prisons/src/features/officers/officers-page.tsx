import { Createpanel } from '@/components/create-panel'
import { useFacilities, useFacilityOfficers, type FacilityOfficer } from '@/features/facilities'
import { OfficerAvatar } from './officer-avatar'
import { OfficerForm } from './officer-form'
import { FacilityOfficerProfile, OfficerProfile } from './officer-profile'
import { useOfficers } from './queries'
import { officerRoleLabel, type Officer } from './schema'
import { useHqConfig, usePermissions } from '@/features/session'
import { AddCircleIcon, ShieldKeyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { cn } from '@pleadli/ui/lib/utils'
import { format } from 'date-fns/format'
import { useMemo, useState } from 'react'
import { m } from '@/paraglide/messages'

/** Accounts of this installation. The node decides who may manage them
 * (`accounts.manage`); this page only asks and shows what it is told. */
export function OfficersPage() {
  const { data: config } = useHqConfig()
  const { can, session } = usePermissions()

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m.route_officers_accounts()}</h1>
          <p className="md:max-w-lg">
            {config?.isHeadOffice
              ? m.route_officers_every_account_in_head_office_and()
              : m.route_officers_officer_accounts_for_this_facility_accou()}
          </p>
        </div>
      </header>

      {session &&
        (can('accounts.manage') ? (
          config?.isHeadOffice ? <HeadOfficeAccounts /> : <AccountsPanel headOffice={false} />
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center text-muted-foreground">
            <HugeiconsIcon icon={ShieldKeyIcon} size={20} />
            <p className="text-sm">{m.route_officers_only_an_administrator_can_manage_account()}</p>
          </div>
        ))}
    </article>
  )
}

function HeadOfficeAccounts() {
  return (
    <Tabs defaultValue="accounts">
      <TabsList variant="line">
        <TabsTrigger value="accounts">{m.route_officers_head_office_accounts()}</TabsTrigger>
        <TabsTrigger value="facility-officers">{m.route_officers_facility_officers()}</TabsTrigger>
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
              {m.route_officers_add_account()}
            </Button>
          }
          headings={{ title: m.route_officers_add_account(), description: m.route_officers_create_a_new_account_for_this() }}
        >
          <OfficerForm onSuccess={() => setAddOpen(false)} />
        </Createpanel>
      </div>

      <Createpanel
        open={viewing !== null}
        onOpenChange={(open) => {
          if (!open) setViewing(null)
        }}
        headings={{ title: m.route_officers_account(), description: m.route_officers_profile_and_recent_activity() }}
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
        headings={{ title: m.route_officers_edit_account(), description: m.route_officers_update_this_account() }}
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
        header: m.route_officers_name(),
        cell: ({ row }) => (
          <button type="button" className="flex items-center gap-2 text-left" onClick={() => onSelect(row.original)}>
            <OfficerAvatar officer={row.original} size={24} />
            {row.original.name}
          </button>
        ),
      },
      { accessorKey: 'badgeNumber', header: m.route_officers_badge_number() },
      { accessorKey: 'rank', header: m.route_officers_rank(), cell: ({ getValue }) => getValue<string | null>() ?? '' },
      {
        accessorKey: 'role',
        header: m.route_officers_role(),
        cell: ({ row }) => <Badge variant="secondary">{officerRoleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: 'isAdmin',
        header: m.route_officers_administrator(),
        cell: ({ row }) => (row.original.isAdmin ? <Badge>{m.route_officers_administrator()}</Badge> : <span className="text-muted-foreground">{m.route_officers_no()}</span>),
      },
      {
        accessorKey: 'active',
        header: m.route_officers_status(),
        cell: ({ row }) => <Badge variant={row.original.active ? 'default' : 'secondary'}>{row.original.active ? m.route_officers_active() : m.route_officers_disabled()}</Badge>,
      },
      { accessorKey: 'phone', header: m.route_officers_phone(), cell: ({ getValue }) => getValue<string | null>() ?? '' },
      { accessorKey: 'email', header: m.route_officers_email(), cell: ({ getValue }) => getValue<string | null>() ?? '' },
      ...(headOffice
        ? [
            {
              accessorKey: 'postedFacilityId',
              header: m.route_officers_posted_facility(),
              cell: ({ row }: { row: { original: Officer } }) =>
                row.original.postedFacilityId
                  ? (facilityNames.get(row.original.postedFacilityId) ?? row.original.postedFacilityId)
                  : '',
            } satisfies DataTableColumnDef<Officer>,
          ]
        : []),
      {
        accessorKey: 'lastLoginAt',
        header: m.route_officers_last_sign_in(),
        cell: ({ getValue }) => {
          const value = getValue<number | null>()
          return value ? format(value, 'PPp') : m.route_officers_never()
        },
      },
      {
        accessorKey: 'createdAt',
        header: m.route_officers_added(),
        cell: ({ getValue }) => format(getValue<number>(), 'PPp'),
      },
    ],
    [onSelect, facilityNames, headOffice],
  )

  return (
    <DataTable
      aria-label={m.route_officers_officers()}
      data={officers}
      columns={columns}
      getRowId={(row) => row.id}
      emptyMessage={m.route_officers_no_officers_added_yet()}
      searchPlaceholder={m.route_officers_search_by_name_or_badge_number()}
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
        header: m.route_officers_badge_number(),
        cell: ({ row }) => (
          <span className="cursor-pointer rounded-md bg-primary/15 px-3 py-1 text-xs" onClick={() => setViewing(row.original)}>
            {row.original.badgeNumber}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: m.route_officers_name(),
        cell: ({ row }) => (
          <button type="button" className="flex items-center gap-2 text-left" onClick={() => setViewing(row.original)}>
            <OfficerAvatar officer={{ name: row.original.name }} size={24} />
            {row.original.name}
          </button>
        ),
      },
      { accessorKey: 'facilityName', header: m.route_officers_facility() },
      {
        accessorKey: 'role',
        header: m.route_officers_role(),
        cell: ({ row }) => <Badge variant="secondary">{officerRoleLabel(row.original.role)}</Badge>,
      },
      {
        accessorKey: 'isAdmin',
        header: m.route_officers_administrator(),
        cell: ({ row }) => (row.original.isAdmin ? <Badge>{m.route_officers_administrator()}</Badge> : <span className="text-muted-foreground">{m.route_officers_no()}</span>),
      },
      {
        accessorKey: 'active',
        header: m.route_officers_status(),
        cell: ({ row }) => <Badge variant={row.original.active ? 'default' : 'secondary'}>{row.original.active ? m.route_officers_active() : m.route_officers_disabled()}</Badge>,
      },
      {
        accessorKey: 'syncedAt',
        header: m.route_officers_last_pushed(),
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
        headings={{ title: m.route_officers_facility_officer(), description: m.route_officers_as_reported_to_head_office_read() }}
      >
        {viewing && <FacilityOfficerProfile key={`${viewing.facilityId}:${viewing.badgeNumber}`} officer={viewing} />}
      </Createpanel>

      <DataTable
        aria-label={m.route_officers_facility_officers()}
        data={officers ?? []}
        columns={columns}
        getRowId={(row) => `${row.facilityId}:${row.badgeNumber}`}
        emptyMessage={m.route_officers_no_connected_facility_has_reported_its()}
        searchPlaceholder={m.route_officers_search_by_name_badge_or_facility()}
      />
    </div>
  )
}
