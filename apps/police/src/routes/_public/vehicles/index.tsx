import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { RecordList } from '@/features/paper/record-list'
import { RecordPaper } from '@/features/paper/record-paper'
import { useVehicles, VehicleForm, vehicleOwnerName, vehiclesOptions, type Vehicle } from '@/features/vehicles'
import { format } from '@/lib/date'
import { Car01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField } from '@pleadli/paper'
import { createFileRoute, useNavigate } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/vehicles/')({
  validateSearch: (search: Record<string, unknown>): { open?: string } => (typeof search.open === 'string' ? { open: search.open } : {}),
  loader: async ({ context }) => {
    await context.queryClient.query({ ...vehiclesOptions(''), staleTime: 'static' })
  },
  component: RouteComponent,
})

const describe = (v: Vehicle) => [v.color, v.make, v.model].filter(Boolean).join(' ')

function VehiclePaper({ vehicle }: { vehicle: Vehicle }) {
  const owner = vehicleOwnerName(vehicle)
  return (
    <RecordPaper
      entityType="vehicle"
      entityId={vehicle.id}
      reference={vehicle.plateNumber}
      title={m["vehicles_page.paper_title"]()}
      details={[
        { label: m["vehicles.plate"](), value: vehicle.plateNumber, copy: vehicle.plateNumber },
        ...(describe(vehicle) ? [{ label: m["vehicles_page.vehicle"](), value: describe(vehicle) }] : []),
        ...(owner ? [{ label: m["vehicles_page.owner"](), value: owner }] : []),
      ]}
      events={[{ at: vehicle.createdAt, label: m["vehicles_page.recorded"]() }]}
      edit={(done) => <VehicleForm key={vehicle.id} vehicle={vehicle} onSuccess={done} />}
    >
      <h2>{vehicle.plateNumber}</h2>
      <section className="mb-5 flex flex-col gap-0.5">
        {vehicle.make && <PaperField label={m["vehicles.make"]()}>{vehicle.make}</PaperField>}
        {vehicle.model && <PaperField label={m["vehicles.model"]()}>{vehicle.model}</PaperField>}
        {vehicle.color && <PaperField label={m["vehicles.color"]()}>{vehicle.color}</PaperField>}
        <PaperField label={m["vehicles_page.owner"]()}>{owner ?? m["vehicles_page.owner_unknown"]()}</PaperField>
        <PaperField label={m["vehicles_page.recorded"]()}>{format(vehicle.createdAt, 'PP')}</PaperField>
      </section>
      {vehicle.notes && <p className="whitespace-pre-wrap">{vehicle.notes}</p>}
    </RecordPaper>
  )
}

/** Vehicles the station knows of, by plate, each with its owner where known. */
function RouteComponent() {
  const { open } = Route.useSearch()
  const navigate = useNavigate()
  const { data: vehicles } = useVehicles('')

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{m["nav.vehicles"]()}</h1>
          <p>{vehicles.length === 1 ? m["vehicles_page.count_one"]() : m["vehicles_page.count"]({ count: vehicles.length })}</p>
        </div>
        <div className="page-actions">
          <PanelButton label={m["vehicles.submit"]()} title={m["vehicles.submit"]()} description={m["vehicles_page.add_desc"]()} variant="default">
            {({ close }) => <VehicleForm onSuccess={close} />}
          </PanelButton>
        </div>
      </header>

      <RecordList
        items={vehicles}
        groupBy="none"
        date={(v) => v.createdAt}
        label={(v) => <span className="font-medium tracking-wide">{v.plateNumber}</span>}
        detail={(v) => [describe(v), vehicleOwnerName(v)].filter(Boolean).join(' · ')}
        searchText={(v) => [v.plateNumber, describe(v), vehicleOwnerName(v) ?? ''].join(' ')}
        paper={(v) => <VehiclePaper vehicle={v} />}
        windowTitle={(v) => v.plateNumber}
        empty={m["vehicles_page.empty"]()}
        emptyIcon={<HugeiconsIcon icon={Car01Icon} />}
        searchPlaceholder={m["vehicles_page.search"]()}
        opened={open ?? null}
        onOpened={(id) => void navigate({ to: '/vehicles', search: id ? { open: id } : {}, replace: true })}
      />
    </article>
  )
}
