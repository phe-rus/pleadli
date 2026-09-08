import { Sparkline } from '@/components/charts/sparkline'
import { AttentionItem } from '@/components/list-cards/attention-item'
import { CaseRow } from '@/components/list-cards/case-row'
import * as mock from '@/data/overview'
import {
  Add01Icon,
  AlarmClockIcon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Building06Icon,
  CellsIcon,
  File02Icon,
  Notebook01Icon,
  UserGroupIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@pleadli/ui/badge'
import { Button } from '@pleadli/ui/button'
import { Card, CardContent } from '@pleadli/ui/card'
import { cn } from '@pleadli/ui/lib/utils'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  component: RouteComponent,
})

function RouteComponent() {
  const maxOf = (rows: readonly mock.BarDatum[]) => Math.max(...rows.map((r) => r.value))
  const flowPeak = maxOf(mock.weeklyFlow)

  return (
    <article className="container flex flex-col gap-6 pt-6 pb-20">
      <Card className="border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10 p-0">
        <CardContent className={cn(
          "flex flex-col sm:flex-row items-start",
          'sm:items-center justify-between gap-3 py-2.5 px-4'
        )}>
          <div className="flex md:items-center gap-2.5">
            <span className="relative flex size-2.5">
              <span className={cn(
                "absolute inline-flex h-full w-full animate-ping",
                'rounded-full bg-amber-400 opacity-75'
              )}></span>
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-500"></span>
            </span>
            <div className={cn(
              "flex flex-col sm:flex-row md:items-center",
              'md:gap-3'
            )}>
              <h3>
                48h Custody Alert
              </h3>
              <span className="hidden md:block">•</span>
              <p>
                2 suspects in cell lock-up are nearing the 48-hour constitutional limit.
              </p>
            </div>
          </div>
          <Button size="xs">
            Review Cell Log
          </Button>
        </CardContent>
      </Card>

      <section className='flex flex-col gap-3 md:flex-row md:justify-between md:items-center'>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1">
            <HugeiconsIcon icon={Building06Icon} className="size-4" />
            <div className='flex flex-wrap items-center text-xs gap-5'>
              <span className='truncate'>Central Police Station · Kampala</span>
              <span>•</span>
              <span className='truncate'>Day Shift (06:00 – 18:00)</span>
            </div>
          </div>
          <h1>Station Overview</h1>
        </div>

        <div className="flex items-center gap-1 col-span-6">
          <Button
            size='sm'
            variant='secondary'
          >
            <HugeiconsIcon icon={UserGroupIcon} />
            <strong>{mock.officersOnDuty.current}</strong>
            / {mock.officersOnDuty.total} Officers on Duty
          </Button>
          <Button size="sm">
            <HugeiconsIcon icon={Add01Icon} />
            New SD Entry
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-2 md:flex md:flex-wrap gap-3">
        <Card className="p-0 h-fit md:min-w-3xs! md:max-w-3xs!">
          <CardContent className='p-3'>
            <div className="flex items-center justify-between">
              <h1>Cell Lock-up</h1>
              <HugeiconsIcon icon={CellsIcon} className="size-5" />
            </div>
            <div className="flex items-baseline justify-between">
              <h1 className="text-5xl tabular-nums">14</h1>
              <Badge variant="secondary">
                3 Over 24h
              </Badge>
            </div>
            <p>Capacity: 25 suspects</p>
          </CardContent>
        </Card>

        <Card className="p-0 h-fit md:min-w-3xs! md:max-w-3xs!">
          <CardContent className='p-3'>
            <div className="flex items-center justify-between">
              <h1 className='text-primary'>Near 48h Limit</h1>
              <HugeiconsIcon
                icon={AlarmClockIcon}
                className="size-5 text-primary"
              />
            </div>
            <div className="flex items-baseline justify-between">
              <h1 className="text-5xl tabular-nums">02</h1>
              <Badge variant="destructive">
                Action Needed
              </Badge>
            </div>
            <p>Must produce in court today</p>
          </CardContent>
        </Card>

        <Card className="p-0 h-fit md:min-w-3xs! md:max-w-3xs!">
          <CardContent className='p-3'>
            <div className="flex items-center justify-between">
              <h1>SD Entries Today</h1>
              <HugeiconsIcon
                icon={Notebook01Icon}
                className="size-5"
              />
            </div>

            <div className="flex items-baseline justify-between">
              <h1 className="text-5xl tabular-nums">{mock.casesThisMonth}</h1>
              <span className="flex items-center text-emerald-600 font-medium">
                <HugeiconsIcon icon={ArrowUp01Icon} className="size-3" />
                +{mock.casesTrend.delta}%
              </span>
            </div>
            <p>Since 06:00 shift start</p>
          </CardContent>
        </Card>

        <Card className="p-0 h-fit md:min-w-3xs! md:max-w-3xs!">
          <CardContent className='p-3'>
            <div className="flex items-center justify-between">
              <h1>Active CID Files</h1>
              <HugeiconsIcon
                icon={File02Icon}
                className="size-5"
              />
            </div>

            <div className="flex items-baseline justify-between">
              <h1 className="text-5xl tabular-nums">28</h1>
              <Badge variant="outline">
                6 With RSA
              </Badge>
            </div>
            <p>12 Pending Statements</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-12 gap-6">
        <div className="flex flex-col gap-4 col-span-12 lg:col-span-7">
          <div className="flex justify-between">
            <div className='flex flex-col'>
              <h2>Station Diary & Live Activity</h2>
              <p>Recent entries recorded at counter</p>
            </div>
            <Button
              size="sm"
              variant='secondary'
            >
              View SD Ledger
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>

          <Card className='p-0'>
            <CardContent className="p-0 divide-y divide-border/60">
              {mock.attentionItems.map((item) => (
                <div key={item.label} className="px-3 py-1">
                  <AttentionItem item={item} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6 col-span-12 lg:col-span-5">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between">
              <div className='flex flex-col'>
                <h2>My Investigation Files</h2>
                <p>Assigned cases requiring action</p>
              </div>
              <Button
                size="sm"
                variant='secondary'
              >
                View All
                <HugeiconsIcon icon={ArrowRight01Icon} />
              </Button>
            </div>

            <Card className='p-0'>
              <CardContent className="p-0 divide-y divide-border/60">
                {mock.caseRows.map((row) => (
                  <CaseRow key={row.reference} row={row} />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="p-0">
            <CardContent className='p-0'>
              <div className="flex justify-between p-5">
                <h1>8-Week Intake Trend</h1>
                <p className="tabular-nums">Peak: {flowPeak} cases/wk</p>
              </div>
              <Sparkline data={mock.weeklyFlow.map((d) => d.value)} />
            </CardContent>
          </Card>
        </div>
      </section>
    </article>
  )
}