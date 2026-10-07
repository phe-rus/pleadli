import * as m from '@/paraglide/messages'
import { PanelButton } from '@/components/add-panel'
import { RecordList } from '@/features/paper/record-list'
import { RecordPaper } from '@/features/paper/record-paper'
import { format } from '@/lib/date'
import { ArchiveIcon, GunIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { PaperField, SignatureLine } from '@pleadli/paper'
import { Segmented } from '@pleadli/ui/segmented'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { useStationAssets } from './queries'
import { stationAssetPersonName, stationAssetStatusLabel, type StationAsset } from './schema'
import { StationAssetForm } from './station-asset-form'

type Category = 'armory' | 'impounded'
type View = 'here' | 'out' | 'all'

/** One item as its register entry: what it is, its serial or mark, where it
 * is, and who holds it or whose it is. */
function AssetPaper({ asset, category }: { asset: StationAsset; category: Category }) {
  const person = stationAssetPersonName(asset)
  return (
    <RecordPaper
      entityType="station_asset"
      entityId={asset.id}
      reference={asset.itemIdentifier}
      title={category === 'armory' ? m["stores.armory_paper"]() : m["stores.impounded_paper"]()}
      details={[
        { label: m["stores.item"](), value: asset.description },
        ...(asset.itemIdentifier ? [{ label: m["assets.identifier"](), value: asset.itemIdentifier, copy: asset.itemIdentifier }] : []),
        { label: m["col.status"](), value: stationAssetStatusLabel(asset.status) },
        ...(asset.holderName ? [{ label: m["assets.held_by"](), value: asset.holderName }] : []),
      ]}
      events={[{ at: asset.createdAt, label: m["stores.entered"]() }]}
      edit={(done) => <StationAssetForm key={asset.id} category={category} asset={asset} onSuccess={done} />}
    >
      <h2>{asset.description}</h2>
      <section className="mb-5 flex flex-col gap-0.5">
        {asset.itemIdentifier && <PaperField label={m["assets.identifier"]()}>{asset.itemIdentifier}</PaperField>}
        <PaperField label={m["col.status"]()}>{stationAssetStatusLabel(asset.status)}</PaperField>
        {asset.holderName && <PaperField label={m["assets.held_by"]()}>{asset.holderName}</PaperField>}
        {person && <PaperField label={category === 'impounded' ? m["stores.taken_from"]() : m["stores.person"]()}>{person}</PaperField>}
        <PaperField label={m["stores.entered"]()}>{format(asset.createdAt, 'PPp')}</PaperField>
      </section>
      {asset.notes && <p className="whitespace-pre-wrap">{asset.notes}</p>}
      <section className="mt-12 flex justify-end">
        <SignatureLine caption={m["stores.store_officer"]()} />
      </section>
    </RecordPaper>
  )
}

/**
 * The armoury and the impounded property store: one register each, seen as
 * what is in the store, what is out (issued or released), or everything.
 * Each item opens as its register entry.
 */
export function StationAssetsPage({ category }: { category: Category }) {
  const search = useSearch({ strict: false }) as { open?: string }
  const navigate = useNavigate()
  const [view, setView] = useState<View>('here')
  const { data: all } = useStationAssets('')
  const assets = all.filter((a) => a.category === category)
  const shown = view === 'here' ? assets.filter((a) => a.status === 'in_store') : view === 'out' ? assets.filter((a) => a.status !== 'in_store') : assets
  const inStore = assets.filter((a) => a.status === 'in_store').length
  const to = category === 'armory' ? '/stores/armory' : '/stores/impounded'
  const title = category === 'armory' ? m["nav.armory"]() : m["nav.impounded_assets"]()

  return (
    <article className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p>{m["stores.in_store_count"]({ count: inStore, total: assets.length })}</p>
        </div>
        <div className="page-actions">
          <Segmented
            label={m["custody_page.view"]()}
            value={view}
            onChange={setView}
            items={[
              { value: 'here', label: m["assets.status.in_store"]() },
              { value: 'out', label: category === 'armory' ? m["stores.issued_out"]() : m["stores.gone"]() },
              { value: 'all', label: m["custody_page.all_records"]() },
            ]}
          />
          <PanelButton label={category === 'armory' ? m["stores.armory_add"]() : m["stores.impounded_add"]()} title={category === 'armory' ? m["stores.armory_add"]() : m["stores.impounded_add"]()} description={category === 'armory' ? m["stores.armory_desc"]() : m["stores.impounded_desc"]()} variant="default">
            {({ close }) => <StationAssetForm category={category} onSuccess={close} />}
          </PanelButton>
        </div>
      </header>

      <RecordList
        items={shown}
        groupBy="none"
        date={(a) => a.createdAt}
        label={(a) => a.description}
        detail={(a) => [a.itemIdentifier, view !== 'here' ? stationAssetStatusLabel(a.status) : null, a.holderName, stationAssetPersonName(a)].filter(Boolean).join(' · ')}
        searchText={(a) => [a.description, a.itemIdentifier ?? '', a.holderName ?? '', stationAssetPersonName(a) ?? ''].join(' ')}
        paper={(a) => <AssetPaper asset={a} category={category} />}
        windowTitle={(a) => a.itemIdentifier || a.description}
        empty={m["stores.empty"]()}
        emptyIcon={<HugeiconsIcon icon={category === 'armory' ? GunIcon : ArchiveIcon} />}
        searchPlaceholder={m["stores.search_here"]()}
        opened={search.open ?? null}
        onOpened={(id) => void navigate({ to, search: id ? { open: id } : {}, replace: true } as never)}
      />
    </article>
  )
}
