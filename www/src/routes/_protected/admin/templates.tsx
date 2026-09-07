import { listTemplates, updateTemplate } from '@/functions/template.func'
import { AddCircleIcon, LayoutTemplateIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import type { SelectOption } from '@pleadli/forms-tables/forms'
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
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { toast } from 'gooey-toast'
import { useState } from 'react'
import * as z from 'zod'

export const Route = createFileRoute('/_protected/admin/templates')({
  loader: () => listTemplates(),
  component: RouteComponent,
})

function RouteComponent() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const typeOptions: SelectOption[] = [
    { label: 'Police', value: 'police' },
    { label: 'DPP', value: 'dpp' },
    { label: 'Courts', value: 'courts' },
    { label: 'Prisons', value: 'prisons' },
    { label: 'Lawyers', value: 'lawyers' },
  ]

  const templateFormSchema = z.object({
    institutionType: z.enum(['police', 'dpp', 'courts', 'prisons', 'lawyers']),
    name: z.string().min(1, 'Name is required.'),
    description: z.string(),
    defaultUnits: z.array(
      z.object({ name: z.string(), children: z.array(z.any()).optional() }),
    ),
    defaultEntitlements: z.array(
      z.object({ application: z.string().min(1), enabled: z.boolean() }),
    ),
    formSchema: z.array(
      z.object({
        name: z.string().min(1),
        label: z.string().min(1),
        type: z.enum(['text', 'textarea', 'select', 'date']),
        required: z.boolean().optional(),
        options: z.array(z.string()).optional(),
      }),
    ),
  })

  type TemplateFormValues = z.infer<typeof templateFormSchema>

  const defaultValues: TemplateFormValues = {
    institutionType: 'police',
    name: '',
    description: '',
    defaultUnits: [{ name: 'Head Office' }],
    defaultEntitlements: [],
    formSchema: [],
  }

  const form = useAppForm({
    defaultValues,
    validators: { onChange: templateFormSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await updateTemplate({ data: value })
        toast.success({ title: 'Template saved', description: value.name })
        formApi.reset()
        setOpen(false)
        router.invalidate()
      } catch {
        toast.error({ title: 'Could not save template', description: 'Please try again.' })
      }
    },
  })

  const columns: DataTableColumnDef<(typeof data)[number]>[] = [
    {
      accessorKey: 'institutionType',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.institutionType}</Badge>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => row.original.description ?? '—',
    },
  ]

  return (
    <article className="container flex flex-col gap-5 py-10 md:max-w-5xl">
      <section className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Templates</h1>
          <p className="text-sm text-muted-foreground">Institution templates that seed new organizations.</p>
        </div>

        <Drawer open={open} onOpenChange={setOpen} swipeDirection="right">
          <DrawerTrigger render={<Button />}>
            <HugeiconsIcon icon={AddCircleIcon} data-icon="inline-start" />
            New template
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>New template</DrawerTitle>
              <DrawerDescription>
                Define the default units, entitlements and case form for an institution type.
              </DrawerDescription>
            </DrawerHeader>
            <form
              className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
              onSubmit={(event) => {
                event.preventDefault()
                event.stopPropagation()
                form.handleSubmit()
              }}
            >
              <FieldGroup>
                <form.AppField
                  name="institutionType"
                  children={(field) => (
                    <field.select label="Institution type" options={typeOptions} />
                  )}
                />
                <form.AppField
                  name="name"
                  children={(field) => (
                    <field.input label="Name" placeholder="e.g. Police standard template" />
                  )}
                />
                <form.AppField
                  name="description"
                  children={(field) => (
                    <field.textarea label="Description" placeholder="What is this template for?" />
                  )}
                />
              </FieldGroup>
              <DrawerFooter>
                <form.AppForm>
                  <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(isSubmitting) => (
                      <form.submit label={isSubmitting ? 'Saving…' : 'Save template'} />
                    )}
                  </form.Subscribe>
                </form.AppForm>
              </DrawerFooter>
            </form>
          </DrawerContent>
        </Drawer>
      </section>

      {data.length === 0 ? (
        <Empty className="border">
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={LayoutTemplateIcon} />
          </EmptyMedia>
          <EmptyTitle>No templates yet</EmptyTitle>
          <EmptyDescription>Create a template so new organizations can be seeded from it.</EmptyDescription>
        </Empty>
      ) : (
        <DataTable
          aria-label="templates"
          columns={columns}
          data={data}
          getRowId={(row) => row.id}
          emptyMessage="No templates yet."
          searchPlaceholder="Search templates…"
        />
      )}
    </article>
  )
}