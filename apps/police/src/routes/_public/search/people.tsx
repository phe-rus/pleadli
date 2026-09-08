import { personFullName, type Person } from '@/features/people/data'
import { peopleSearchOptions, useCreatePerson, usePeopleSearch } from '@/features/people/queries'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { useAppForm } from '@pleadli/forms-tables/forms'
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
import { FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import * as z from 'zod'

export const Route = createFileRoute('/_public/search/people')({
  loader: ({ context }) => context.queryClient.ensureQueryData(peopleSearchOptions('')),
  component: RouteComponent,
})

const createPersonSchema = z.object({
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  otherNames: z.string(),
  phone: z.string(),
  nationalId: z.string(),
  address: z.string(),
})

const createPersonDefaults = {
  firstName: '',
  lastName: '',
  otherNames: '',
  phone: '',
  nationalId: '',
  address: '',
}

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const { data: people } = usePeopleSearch('')
  const createPerson = useCreatePerson()

  const form = useAppForm({
    defaultValues: createPersonDefaults,
    validators: { onChange: createPersonSchema },
    onSubmit: async ({ value, formApi }) => {
      try {
        await createPerson.mutateAsync(value)
        t.success('Person added', { description: `${value.lastName}, ${value.firstName}` })
        formApi.reset()
        setAddOpen(false)
      } catch {
        t.error('Could not add person', { description: 'Please try again.' })
      }
    },
  })

  const columns: DataTableColumnDef<Person>[] = [
    {
      id: 'name',
      accessorFn: (row) => personFullName(row),
      header: 'Name',
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ getValue }) => getValue<string | null>() ?? '—',
    },
    {
      accessorKey: 'nationalId',
      header: 'NIN / National ID',
      cell: ({ getValue }) => getValue<string | null>() ?? '—',
    },
    {
      accessorKey: 'address',
      header: 'Address',
      cell: ({ getValue }) => getValue<string | null>() ?? '—',
    },
    {
      accessorKey: 'createdAt',
      header: 'Added',
      cell: ({ getValue }) => new Date(getValue<number>()).toLocaleDateString(),
    },
  ]

  return (
    <Drawer open={addOpen} onOpenChange={setAddOpen} swipeDirection="right">
      <article className="container flex flex-col gap-5 pt-5 pb-20">
        <section className="flex items-center justify-between gap-4">
          <div className="flex flex-col">
            <h1>People</h1>
            <p className="text-sm text-muted-foreground">
              Find a person, or add one if they aren't known to the system yet.
            </p>
          </div>

          <DrawerTrigger render={<Button size="sm" />}>
            <HugeiconsIcon icon={AddCircleIcon} />
            Add person
          </DrawerTrigger>
        </section>

        <DataTable
          aria-label="People"
          data={people}
          columns={columns}
          getRowId={(row) => row.id}
          emptyMessage="No people recorded yet."
          searchPlaceholder="Search people by name, phone, or national ID…"
        />
      </article>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Add person</DrawerTitle>
          <DrawerDescription>
            Record someone who isn't already known to the system.
          </DrawerDescription>
        </DrawerHeader>
        <form
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
        >
          <FieldGroup>
            <form.AppField
              name="firstName"
            >
              {(f) => {
                return (
                  <f.input label="First name" />
                )
              }}
            </form.AppField>
            <form.AppField
              name="lastName"
            >
              {(f) => {
                return (
                  <f.input label="Last name" />
                )
              }}
            </form.AppField>
            <form.AppField
              name="otherNames"
            >
              {(f) => {
                return (
                  <f.input label="Other names" />
                )
              }}
            </form.AppField>
            <form.AppField
              name="phone"
            >
              {(f) => {
                return (
                  <f.input label="Phone number" />
                )
              }}
            </form.AppField>
            <form.AppField
              name="nationalId"
            >
              {(f) => {
                return (
                  <f.input label="NIN / National ID" />
                )
              }}
            </form.AppField>
            <form.AppField
              name="address"
            >
              {(f) => {
                return (
                  <f.input label="Address" />
                )
              }}
            </form.AppField>
          </FieldGroup>
          <DrawerFooter>
            <form.AppForm>
              <form.submit label='Submit' />
            </form.AppForm>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
