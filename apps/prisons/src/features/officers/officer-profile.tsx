import { useFacilities, facilityStatusLabel, type FacilityOfficer } from '@/features/facilities'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pleadli/ui/tabs'
import { format } from 'date-fns/format'
import type { ReactNode } from 'react'
import { OfficerAvatar } from './officer-avatar'
import { useOfficerActivity } from './queries'
import { activityLabel, officerRoleLabel, type Officer } from './schema'
import { m } from '@/paraglide/messages'

function Details({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,10rem)_1fr] gap-x-4 gap-y-2.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="col-span-2 grid grid-cols-subgrid items-baseline">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0 break-words">{row.value ?? <span className="text-muted-foreground">{m.officers_not_recorded()}</span>}</dd>
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
        <span className="font-mono text-xs text-muted-foreground">{m.officers_badge({ badgeNumber: officer.badgeNumber })}</span>
        <div className="flex flex-wrap gap-1.5">{badges}</div>
      </div>
      {children}
    </div>
  )
}

function Activity({ filter }: { filter: { officerId?: string; badge?: string } }) {
  const { data: rows, isLoading } = useOfficerActivity(filter)

  if (isLoading) return <p className="py-6 text-center text-xs text-muted-foreground">{m.officers_loading_activity()}</p>
  if (!rows || rows.length === 0) return <p className="py-6 text-center text-xs text-muted-foreground">{m.officers_no_recorded_activity_yet()}</p>

  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm">{activityLabel(row.action)}</span>
            <span className="truncate text-xs text-muted-foreground">
              {row.entityType}
              {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}
              {row.actorBadge ? m.officers_by({ actorName: row.actorName, actorBadge: row.actorBadge }) : ''}
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
    <div className="panel-body">
      <Header
        officer={officer}
        badges={
          <>
            <Badge variant="secondary">{officerRoleLabel(officer.role)}</Badge>
            {officer.isAdmin && <Badge>{m.officers_administrator()}</Badge>}
            <Badge variant={officer.active ? 'default' : 'secondary'}>{officer.active ? m.officers_active() : m.officers_disabled()}</Badge>
          </>
        }
      >
        <Button size="sm" variant="secondary" onClick={onEdit}>
          {m.officers_edit_account()}
        </Button>
      </Header>

      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">{m.officers_details()}</TabsTrigger>
          <TabsTrigger value="activity">{m.officers_activity()}</TabsTrigger>
          {headOffice && <TabsTrigger value="facility">{m.officers_facility()}</TabsTrigger>}
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <Details
            rows={[
              { label: m.officers_rank(), value: officer.rank },
              { label: m.officers_phone(), value: officer.phone },
              { label: m.officers_email(), value: officer.email },
              { label: m.officers_role(), value: officerRoleLabel(officer.role) },
              { label: m.officers_posted_at(), value: headOffice ? (posted?.name ?? officer.postedFacilityId) : m.officers_this_facility() },
              { label: m.officers_added(), value: format(officer.createdAt, 'PPp') },
              { label: m.officers_last_sign_in(), value: officer.lastLoginAt ? format(officer.lastLoginAt, 'PPp') : m.officers_never_signed_in() },
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
                  { label: m.officers_facility(), value: posted.name },
                  { label: m.officers_facility_number(), value: posted.facilityNumber },
                  { label: m.officers_region(), value: posted.region },
                  { label: m.officers_location(), value: posted.location },
                  { label: m.officers_head_officer(), value: posted.headOfficerName },
                  { label: m.officers_connection(), value: facilityStatusLabel(posted.status) },
                ]}
              />
            ) : (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {m.officers_this_account_is_not_posted_to()}
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
    <div className="panel-body">
      <Header
        officer={{ name: officer.name, badgeNumber: officer.badgeNumber }}
        badges={
          <>
            <Badge variant="secondary">{officerRoleLabel(officer.role)}</Badge>
            {officer.isAdmin && <Badge>{m.officers_administrator()}</Badge>}
            <Badge variant={officer.active ? 'default' : 'secondary'}>{officer.active ? m.officers_active() : m.officers_disabled()}</Badge>
          </>
        }
      />
      <Tabs defaultValue="details">
        <TabsList variant="line">
          <TabsTrigger value="details">{m.officers_details()}</TabsTrigger>
          <TabsTrigger value="activity">{m.officers_head_office_activity()}</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className="pt-4">
          <Details
            rows={[
              { label: m.officers_facility(), value: officer.facilityName },
              { label: m.officers_badge_number(), value: officer.badgeNumber },
              { label: m.officers_role(), value: officerRoleLabel(officer.role) },
              { label: m.officers_administrator(), value: officer.isAdmin ? 'Yes' : 'No' },
              { label: m.officers_status(), value: officer.active ? 'Active' : 'Disabled' },
              { label: m.officers_last_pushed(), value: format(officer.syncedAt, 'PPp') },
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
