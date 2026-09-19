import { useFacilities, facilityStatusLabel, type FacilityOfficer } from '@/features/facilities'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { format } from 'date-fns/format'
import type { ReactNode } from 'react'
import { OfficerAvatar } from './officer-avatar'
import { useOfficerActivity } from './queries'
import { activityLabel, officerRoleLabel, type Officer } from './schema'

function Details({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="col-span-2 grid grid-cols-subgrid items-baseline">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words">{row.value ?? <span className="text-muted-foreground">Not recorded</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

function Header({ officer, badges, children }: { officer: { name: string; photoData?: string | null; badgeNumber: string }; badges: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <OfficerAvatar officer={officer} size={88} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="truncate text-base font-medium">{officer.name}</h3>
        <span className="font-mono text-xs text-muted-foreground">Badge {officer.badgeNumber}</span>
        <div className="flex flex-wrap gap-1.5">{badges}</div>
      </div>
      {children}
    </div>
  )
}

function Activity({ filter }: { filter: { officerId?: string; badge?: string } }) {
  const { data: rows, isLoading } = useOfficerActivity(filter)

  if (isLoading) return <p className="py-6 text-center text-xs text-muted-foreground">Loading activity…</p>
  if (!rows || rows.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">No recorded activity yet.</p>

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm">{activityLabel(row.action)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.entityType}
              {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
              {row.actorBadge ? ` · by ${row.actorName} (${row.actorBadge})` : ''}
            </span>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{format(row.at, 'PPp')}</span>
        </li>
      ))}
    </ul>
  )
}

/** An account of this installation: details, and what the audit trail says
 * this officer did and what was done to the account. */
export function OfficerProfile({ officer, headOffice, onEdit }: { officer: Officer; headOffice: boolean; onEdit: () => void }) {
  const { data: facilities } = useFacilities(headOffice)
  const posted = facilities?.find((f) => f.id === officer.postedFacilityId)

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
      <Header
        officer={officer}
        badges={
          <>
            <Badge variant="secondary">{officerRoleLabel(officer.role)}</Badge>
            {officer.isAdmin && <Badge>Administrator</Badge>}
            <Badge variant={officer.active ? 'default' : 'secondary'}>{officer.active ? 'Active' : 'Disabled'}</Badge>
          </>
        }
      >
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edit account
        </Button>
      </Header>

      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          {headOffice && <TabsTrigger value="facility">Facility</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <Details
            rows={[
              { label: 'Rank', value: officer.rank },
              { label: 'Phone', value: officer.phone },
              { label: 'Email', value: officer.email },
              { label: 'Role', value: officerRoleLabel(officer.role) },
              { label: 'Posted at', value: headOffice ? (posted?.name ?? officer.postedFacilityId) : 'This facility' },
              { label: 'Added', value: format(officer.createdAt, 'PPp') },
              { label: 'Last sign-in', value: officer.lastLoginAt ? format(officer.lastLoginAt, 'PPp') : 'Never signed in' },
            ]}
          />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <Activity filter={{ officerId: officer.id }} />
        </TabsContent>
        {headOffice && (
          <TabsContent value="facility" className="pt-4">
            {posted ? (
              <Details
                rows={[
                  { label: 'Facility', value: posted.name },
                  { label: 'Facility number', value: posted.facilityNumber },
                  { label: 'Region', value: posted.region },
                  { label: 'Location', value: posted.location },
                  { label: 'Head officer', value: posted.headOfficerName },
                  { label: 'Connection', value: facilityStatusLabel(posted.status) },
                ]}
              />
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                This account is not posted to a facility. Set one when editing the account.
              </p>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

/** A facility officer as Head Office knows them: read-only, from what the
 * facility pushed, plus Head Office's own audit rows naming that badge. */
export function FacilityOfficerProfile({ officer }: { officer: FacilityOfficer }) {
  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
      <Header
        officer={{ name: officer.name, badgeNumber: officer.badgeNumber }}
        badges={
          <>
            <Badge variant="secondary">{officerRoleLabel(officer.role)}</Badge>
            {officer.isAdmin && <Badge>Administrator</Badge>}
            <Badge variant={officer.active ? 'default' : 'secondary'}>{officer.active ? 'Active' : 'Disabled'}</Badge>
          </>
        }
      />
      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="activity">Head Office activity</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <Details
            rows={[
              { label: 'Facility', value: officer.facilityName },
              { label: 'Badge number', value: officer.badgeNumber },
              { label: 'Role', value: officerRoleLabel(officer.role) },
              { label: 'Administrator', value: officer.isAdmin ? 'Yes' : 'No' },
              { label: 'Status', value: officer.active ? 'Active' : 'Disabled' },
              { label: 'Last pushed', value: format(officer.syncedAt, 'PPp') },
            ]}
          />
        </TabsContent>
        <TabsContent value="activity" className="pt-4">
          <Activity filter={{ badge: officer.badgeNumber }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
