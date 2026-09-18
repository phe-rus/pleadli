import { OrganizationDetailDrawer } from '@/components/admin/organization-detail-drawer'
import { listOrganizationsAdmin } from '@/functions/admin.func'
import { createOrganization } from '@/functions/org.func'
import { AddCircleIcon, Building02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
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
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@pleadli/ui/empty'
import { FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import * as z from 'zod'

export const Route = createFileRoute('/_protected/admin/organizations')({
  loader: () => listOrganizationsAdmin(),
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailOrg, setDetailOrg] = useState<(typeof data)[number] | null>(null)

  const institutionTypeOptions = [
    { label: 'Police', value: 'police' },
    { label: 'DPP', value: 'dpp' },
    { label: 'Courts', value: 'courts' },
    { label: 'Prisons', value: 'prisons' },
    { label: 'Lawyers', value: 'lawyers' },
  ]

  const createOrgSchema = z.object({
    name: z.string().min(1, 'Name is required.'),
    slug: z.string().min(1, 'Slug is required.'),
    institutionType: z.enum(['police', 'dpp', 'courts', 'prisons', 'lawyers']),
  })

  type CreateOrgValues = z.infer<typeof createOrgSchema>

  const createOrgDefaults: CreateOrgValues = {
    name: '',
    slug: '',
    institutionType: 'police',
  }

  const createForm = useAppForm({
    defaultValues: createOrgDefaults,
    validators: { onChange: createOrgSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createOrganization({ data: value })
        t.success('Organization created', { description: value.name })
        formApi.reset()
        setCreateOpen(false)
        router.invalidate()
      } catch {
        t.error('Could not create organization', { description: 'Please try again.' })
      }
    },
  })

  const columns: DataTableColumnDef<(typeof data)[number]>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'slug',
      header: 'Slug',
    },
    {
      accessorKey: 'institutionType',
      header: 'Institution Type',
      cell: ({ row }) => (
        <Badge variant="outline" className="capitalize">
          {row.original.institutionType}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setDetailOrg(row.original)}
        >
          Details
        </Button>
      ),
    },
  ]

  return (
    <article className="container flex flex-col gap-5 py-10 md:max-w-5xl">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Organizations</h1>
          <p className="text-sm text-muted-foreground">Every institution on the Pleadli platform.</p>
        </div>

        <Drawer open={createOpen} onOpenChange={setCreateOpen} swipeDirection="right">
          <DrawerTrigger render={<Button />}>
            <HugeiconsIcon icon={AddCircleIcon} data-icon="inline-start" />
            New organization
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Create organization</DrawerTitle>
              <DrawerDescription>Add a new institution to the platform.</DrawerDescription>
            </DrawerHeader>
            <form
              className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
              onSubmit={(event) => {
                event.preventDefault()
                event.stopPropagation()
                createForm.handleSubmit()
              }}
            >
              <FieldGroup>
                <createForm.AppField
                  name="name"
                  children={(field) => <field.input label="Name" placeholder="e.g. Uganda Police Force" />}
                />
                <createForm.AppField
                  name="slug"
                  children={(field) => <field.input label="Slug" placeholder="e.g. uganda-police-force" />}
                />
                <createForm.AppField
                  name="institutionType"
                  children={(field) => (
                    <field.select label="Institution type" options={institutionTypeOptions} />
                  )}
                />
              </FieldGroup>
              <DrawerFooter>
                <createForm.AppForm>
                  <createForm.Subscribe selector={(state) => state.isSubmitting}>
                    {(isSubmitting) => (
                      <createForm.submit label={isSubmitting ? 'Creating…' : 'Create organization'} />
                    )}
                  </createForm.Subscribe>
                </createForm.AppForm>
              </DrawerFooter>
            </form>
          </DrawerContent>
        </Drawer>
      </section>

      {data.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Building02Icon} />
          </EmptyMedia>
          <EmptyTitle>No organizations yet</EmptyTitle>
          <EmptyDescription>Create the first organization to get started.</EmptyDescription>
        </Empty>
      ) : (
        <DataTable
          aria-label="organizations"
          columns={columns}
          data={data}
          getRowId={(row) => row.id}
          emptyMessage="No members yet."
          searchPlaceholder="Search by name or slug…"
        />
      )}

      {detailOrg && (
        <OrganizationDetailDrawer
          organizationId={detailOrg.id}
          onClose={() => setDetailOrg(null)}
        />
      )}
    </article>
  )
}