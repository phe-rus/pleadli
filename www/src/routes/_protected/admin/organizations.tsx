import { authClient } from '@/auth/client'
import { listOrganizationsAdmin } from '@/functions/admin.func'
import { AddCircleIcon, Building02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, selectColumn, type DataTableColumnDef } from '@pleadli/forms-tables'
import { Button } from '@pleadli/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@pleadli/ui/dialog'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@pleadli/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '@pleadli/ui/field'
import { Input } from '@pleadli/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@pleadli/ui/toggle-group'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { toast } from 'gooey-toast'
import { useMemo, useState } from 'react'
import * as z from 'zod'

export const Route = createFileRoute('/_protected/admin/organizations')({
  loader: () => listOrganizationsAdmin(),
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const institutionTypes = ['police', 'dpp', 'courts', 'prisons', 'lawyers'] as const

  const createOrganizationSchema = z.object({
    name: z.string().min(1, 'Name is required.'),
    slug: z.string().min(1, 'Slug is required.'),
    institutionType: z.enum(institutionTypes),
  })

  const form = useForm({
    defaultValues: { name: '', slug: '', institutionType: 'police' as (typeof institutionTypes)[number] },
    validators: { onChange: createOrganizationSchema },
    onSubmit: async ({ value, formApi }) => {
      const { error } = await authClient.$fetch('/pleadli/organizations', {
        method: 'POST',
        body: value,
      })
      if (error) {
        toast.error({ title: 'Could not create organization', description: error.message ?? undefined })
        return
      }
      toast.success({ title: 'Organization created', description: value.name })
      formApi.reset()
      setOpen(false)
      router.invalidate()
    },
  })

  const columns: DataTableColumnDef<typeof data[number]>[] = useMemo(() => [
    selectColumn(),
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
    },
  ], [])

  return (
    <article className="container flex flex-col gap-5 py-10 md:max-w-5xl">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Organizations</h1>
          <p className="text-sm text-muted-foreground">Every institution on the Pleadli platform.</p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <HugeiconsIcon icon={AddCircleIcon} data-icon="inline-start" />
            New organization
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create organization</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(event) => {
                event.preventDefault()
                event.stopPropagation()
                form.handleSubmit()
              }}
            >
              <FieldGroup>
                <form.Field name="name">
                  {(field) => (
                    <Field data-invalid={field.state.meta.errors.length > 0}>
                      <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="slug">
                  {(field) => (
                    <Field data-invalid={field.state.meta.errors.length > 0}>
                      <FieldLabel htmlFor={field.name}>Slug</FieldLabel>
                      <Input
                        id={field.name}
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={field.state.meta.errors.length > 0}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>

                <form.Field name="institutionType">
                  {(field) => (
                    <Field>
                      <FieldLabel>Institution type</FieldLabel>
                      <ToggleGroup
                        value={[field.state.value]}
                        onValueChange={(value) => {
                          const next = value[0] as (typeof institutionTypes)[number] | undefined
                          if (next) field.handleChange(next)
                        }}
                        variant="outline"
                      >
                        {institutionTypes.map((type) => (
                          <ToggleGroupItem key={type} value={type} aria-label={type}>
                            {type}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </Field>
                  )}
                </form.Field>

                <DialogFooter>
                  <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(isSubmitting) => (
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create organization'}
                      </Button>
                    )}
                  </form.Subscribe>
                </DialogFooter>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
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
          aria-label='organizations'
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
      )}
    </article>
  )
}
