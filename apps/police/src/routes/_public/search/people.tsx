import { personFullName } from '@/features/people/data'
import { peopleSearchOptions, useCreatePerson, usePeopleSearch } from '@/features/people/queries'
import { createPersonSchema, type Person } from '@/features/people/schema'
import { AddCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { DataTable, type DataTableColumnDef } from '@pleadli/forms-tables'
import { useAppForm } from '@pleadli/forms-tables/forms'
import { Button } from '@pleadli/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from '@pleadli/ui/drawer'
import { FieldGroup } from '@pleadli/ui/field'
import { t } from '@pleadli/ui/goey-toaster'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/_public/search/people')({
  loader: ({ context }) => context.queryClient.ensureQueryData(peopleSearchOptions('')),
  component: RouteComponent,
})

function RouteComponent() {
  const [addOpen, setAddOpen] = useState(false)
  const { data: people } = usePeopleSearch('')
  const createPerson = useCreatePerson()

  const form = useAppForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      otherNames: '',
      phone: '',
      nationalId: '',
      address: '',
    },
    validators: {
      onChange: createPersonSchema,
      onSubmit: createPersonSchema
    },
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
        <section className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className='flex items-center gap-5'>
              <h1>People</h1>

              <DrawerTrigger render={<Button size="sm" />}>
                <HugeiconsIcon icon={AddCircleIcon} />
                Add person
              </DrawerTrigger>
            </div>
            <p className="md:max-w-sm">
              Find a person, or add one if they aren't known to the system yet.
            </p>
          </div>
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
      <DrawerContent className='bg-background!'>
        <DrawerHeader className='gap-0!'>
          <DrawerTitle>Add person</DrawerTitle>
          <DrawerDescription className='md:max-w-sm'>
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
            <div className='grid grid-cols-2 gap-3'>
              <form.AppField
                name="firstName"
              >
                {(f) => (
                  <f.input
                    placeholder='First name'
                    label="First name"
                  />
                )}
              </form.AppField>

              <form.AppField
                name="lastName"
              >
                {(f) => (
                  <f.input
                    placeholder='Last name'
                    label="Last name"
                  />
                )}
              </form.AppField>

              <form.AppField
                name="otherNames"
              >
                {(f) => (
                  <f.input
                    placeholder='Other names'
                    label="Other names"
                  />
                )}
              </form.AppField>

              <div className='col-span-2'>
                <form.AppField
                  name="phone"
                >
                  {(f) => (
                    <f.input
                      placeholder='Phone number'
                      label="Phone number"
                    />
                  )}
                </form.AppField>
              </div>

              <div className='col-span-2'>
                <form.AppField
                  name="nationalId"
                >
                  {(f) => (
                    <f.input
                      placeholder='NIN / National ID'
                      label="NIN / National ID"
                    />
                  )}
                </form.AppField>
              </div>

              <div className='col-span-2'>
                <form.AppField
                  name="address"
                >
                  {(f) => (
                    <f.textarea
                      placeholder='Address'
                      label="Address"
                    />
                  )}
                </form.AppField>
              </div>
            </div>

            <form.AppForm>
              <form.submit label='Submit' />
            </form.AppForm>
          </FieldGroup>
        </form>
      </DrawerContent>
    </Drawer>
  )
}
