import {
  createMembership,
  createUnit,
  deleteUnit,
  getOrganizationDetail,
  setEntitlement,
} from '@/functions/org.func'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@pleadli/ui/drawer'
import { Empty, EmptyDescription } from '@pleadli/ui/empty'
import { FieldGroup } from '@pleadli/ui/field'
import { Separator } from '@pleadli/ui/separator'
import { useRouter } from '@tanstack/react-router'
import { toast } from 'gooey-toast'
import { useEffect, useState } from 'react'
import * as z from 'zod'

type Unit = { id: string; name: string; parentId: string | null }
type Entitlement = { id: string; application: string; enabled: boolean }
type Membership = { id: string; userId: string; title: string; organizationUnitId: string }
type OrgDetail = {
  organization: { id: string; name: string; slug: string; institutionType: string }
  units: Unit[]
  entitlements: Entitlement[]
  memberships: Membership[]
}

const unitSchema = z.object({
  name: z.string().min(1, 'Unit name is required.'),
})

const memberSchema = z.object({
  userId: z.string().min(1, 'User is required.'),
  organizationUnitId: z.string().min(1, 'Unit is required.'),
  title: z.string().min(1, 'Title is required.'),
})

type UnitFormValues = z.infer<typeof unitSchema>
type MemberFormValues = z.infer<typeof memberSchema>

const unitDefaults: UnitFormValues = { name: '' }
const memberDefaults: MemberFormValues = { userId: '', organizationUnitId: '', title: '' }

export function OrganizationDetailDrawer({
  organizationId,
  onClose,
}: {
  organizationId: string
  onClose: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<OrgDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [unitOpen, setUnitOpen] = useState(false)
  const [memberOpen, setMemberOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getOrganizationDetail({ data: { id: organizationId } })
      .then((result) => {
        if (!cancelled) {
          setDetail(result as unknown as OrgDetail)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [organizationId])

  async function refresh() {
    const result = await getOrganizationDetail({ data: { id: organizationId } })
    setDetail(result as unknown as OrgDetail)
  }

  const unitForm = useAppForm({
    defaultValues: unitDefaults,
    validators: { onChange: unitSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createUnit({ data: { organizationId, name: value.name } })
        toast.success({ title: 'Unit created', description: value.name })
        formApi.reset()
        setUnitOpen(false)
        await refresh()
        router.invalidate()
      } catch {
        toast.error({ title: 'Could not create unit', description: 'Please try again.' })
      }
    },
  })

  const memberForm = useAppForm({
    defaultValues: memberDefaults,
    validators: { onChange: memberSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createMembership({ data: value })
        toast.success({ title: 'Member added', description: value.title })
        formApi.reset()
        setMemberOpen(false)
        await refresh()
        router.invalidate()
      } catch {
        toast.error({ title: 'Could not add member', description: 'Please try again.' })
      }
    },
  })

  async function toggleEntitlement(entitlement: Entitlement) {
    try {
      await setEntitlement({
        data: {
          organizationId,
          application: entitlement.application,
          enabled: !entitlement.enabled,
        },
      })
      await refresh()
    } catch {
      toast.error({ title: 'Could not update entitlement', description: 'Please try again.' })
    }
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()} swipeDirection="right">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{detail?.organization.name ?? 'Organization'}</DrawerTitle>
          <DrawerDescription>
            {detail?.organization.institutionType}
            {detail?.organization.slug ? ` · ${detail?.organization.slug}` : ''}
          </DrawerDescription>
        </DrawerHeader>

        {loading && !detail ? (
          <div className="flex flex-1 items-center justify-center p-8">
            <span className="text-sm text-muted-foreground">Loading…</span>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Units</h2>
                <Drawer open={unitOpen} onOpenChange={setUnitOpen} swipeDirection="right">
                  <DrawerTrigger render={<Button size="xs" variant="outline" />}>
                    <HugeiconsIcon icon={AddCircleIcon} data-icon="inline-start" />
                    Add unit
                  </DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>Add unit</DrawerTitle>
                      <DrawerDescription>Create a new unit within this organization.</DrawerDescription>
                    </DrawerHeader>
                    <form
                      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
                      onSubmit={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        unitForm.handleSubmit()
                      }}
                    >
                      <FieldGroup>
                        <unitForm.AppField
                          name="name"
                          children={(field) => (
                            <field.input label="Unit name" placeholder="e.g. Counter Terrorism" />
                          )}
                        />
                      </FieldGroup>
                      <DrawerFooter>
                        <unitForm.AppForm>
                          <unitForm.submit label="Add unit" />
                        </unitForm.AppForm>
                      </DrawerFooter>
                    </form>
                  </DrawerContent>
                </Drawer>
              </div>

              {detail?.units.length === 0 ? (
                <Empty className="border">
                  <EmptyDescription>No units yet.</EmptyDescription>
                </Empty>
              ) : (
                <ul className="flex flex-col divide-y">
                  {detail?.units.map((unit) => (
                    <li key={unit.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-sm">{unit.name}</span>
                      <Button
                        type="button"
                        size="xs"
                        variant="destructive"
                        onClick={async () => {
                          await deleteUnit({ data: { id: unit.id } })
                          router.invalidate()
                          await refresh()
                        }}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-medium">Entitlements</h2>
              {detail?.entitlements.length === 0 ? (
                <Empty className="border">
                  <EmptyDescription>No entitlements have been set for this organization.</EmptyDescription>
                </Empty>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail?.entitlements.map((entitlement) => (
                    <li key={entitlement.id} className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">{entitlement.application}</span>
                      </div>
                      <Badge variant={entitlement.enabled ? 'default' : 'outline'}>
                        {entitlement.enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        onClick={() => toggleEntitlement(entitlement)}
                      >
                        Toggle
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Members</h2>
                <Drawer open={memberOpen} onOpenChange={setMemberOpen} swipeDirection="right">
                  <DrawerTrigger render={<Button size="xs" variant="outline" />}>
                    <HugeiconsIcon icon={AddCircleIcon} data-icon="inline-start" />
                    Add member
                  </DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>Add member</DrawerTitle>
                      <DrawerDescription>Assign someone to a unit within this organization.</DrawerDescription>
                    </DrawerHeader>
                    <form
                      className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
                      onSubmit={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        memberForm.handleSubmit()
                      }}
                    >
                      <FieldGroup>
                        <memberForm.AppField
                          name="userId"
                          children={(field) => <field.input label="User ID" placeholder="The Pleadli user UUID" />}
                        />
                        <memberForm.AppField
                          name="organizationUnitId"
                          children={(field) => (
                            <field.select
                              label="Unit"
                              options={(detail?.units ?? []).map((unit) => ({
                                label: unit.name,
                                value: unit.id,
                              }))}
                            />
                          )}
                        />
                        <memberForm.AppField
                          name="title"
                          children={(field) => <field.input label="Title / Rank" placeholder="e.g. Inspector" />}
                        />
                      </FieldGroup>
                      <DrawerFooter>
                        <memberForm.AppForm>
                          <memberForm.submit label="Add member" />
                        </memberForm.AppForm>
                      </DrawerFooter>
                    </form>
                  </DrawerContent>
                </Drawer>
              </div>

              {detail?.memberships.length === 0 ? (
                <Empty className="border">
                  <EmptyDescription>No members assigned yet.</EmptyDescription>
                </Empty>
              ) : (
                <ul className="flex flex-col divide-y">
                  {detail?.memberships.map((membership) => (
                    <li key={membership.id} className="flex flex-col py-2">
                      <span className="text-sm font-medium">{membership.title}</span>
                      <span className="text-xs text-muted-foreground">
                        User {membership.userId.slice(0, 8)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}