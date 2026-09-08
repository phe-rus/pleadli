import { Sparkline } from '@/components/charts/sparkline'
import { AttentionItem } from '@/components/list-cards/attention-item'
import { CaseRow } from '@/components/list-cards/case-row'
import * as mock from '@/data/overview'
import {
  ArrowRight01Icon,
  ArrowUp01Icon,
  Building06Icon,
  Notification01Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
    <article className="container flex flex-col gap-5 pt-5 pb-20">
      <Card className='p-0'>
        <CardContent className='flex items-center justify-between gap-5 py-1 px-3'>
          <div className='flex items-center gap-1.5'>
            <HugeiconsIcon
              icon={Notification01Icon}
              className='size-4'
            />
            <h2 className='font-heading'>No notifications today</h2>
          </div>
          <p>Check back tomorrow for your daily briefing</p>
        </CardContent>
      </Card>
      <section className="flex flex-col min-h-[30vh]">
        <div className='flex flex-col my-auto'>
          <p className='text-xl md:text-2xl'>
            <HugeiconsIcon icon={Building06Icon} className='size-12' />
            Central Police Station · Kampala
          </p>
          <h1 className="font-heading text-2xl md:text-5xl"> Good morning, Officer</h1>
          <p className="text-xs/relaxed">
            Tuesday, 8 September 2026 · {mock.officersOnDuty.current} of{' '}
            {mock.officersOnDuty.total} officers on duty · 06:00–18:00
          </p>
        </div>
      </section>

      <section className="grid grid-cols-12 gap-5">
        <div className="flex flex-col gap-5 col-span-12 md:col-span-8">
          <div className='flex flex-col'>
            <h3>Cases opened this month</h3>
            <div className="flex flex-wrap items-end gap-3">
              <h1 className="font-heading text-6xl leading-none tabular-nums">
                {mock.casesThisMonth}
              </h1>
              <p className="flex items-center gap-1 text-xs!">
                <HugeiconsIcon icon={ArrowUp01Icon} className='size-5' />
                {mock.casesTrend.delta}% {mock.casesTrend.note}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-5 mt-auto">
            <Sparkline
              data={mock.weeklyFlow.map((d) => d.value)}
            />
            <div className="flex text-xs items-center justify-between">
              <p>8-week case flow</p>
              <p>peak week {flowPeak} cases</p>
            </div>
          </div>
        </div>

        <Card className={cn(
          "col-span-12 md:col-span-4 self-auto h-fit",
          'ring-border/55!'
        )}>
          <CardContent className='grid grid-cols-2 gap-5'>
            {mock.supportingFigures.map((figure) => (
              <div key={figure.label} className="flex min-w-0 flex-col gap-1">
                <h3 className='font-heading'>{figure.label}</h3>
                <h1 className="text-muted-foreground leading-none tabular-nums">
                  {figure.value}
                </h1>
                {figure.hint ? (
                  <p className="text-xs/relaxed text-muted-foreground">{figure.hint}</p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-12 gap-5">
        <div className="flex flex-col gap-5 col-span-12 md:col-span-7">
          <div className="flex items-baseline justify-between gap-3">
            <h2>History & Tracking</h2>
            <Button
              size='sm'
              data-icon="inline-end"
            >
              View all
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
          <span className='border-t border-border/60' />
          <div className="flex flex-col gap-1">
            {mock.attentionItems.map((item) => (
              <AttentionItem key={item.label} item={item} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-5 col-span-12 md:col-span-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2>My cases</h2>
            <Button
              size="sm"
              data-icon="inline-end"
            >
              View all
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
          </div>
          <span className='border-t border-border/60' />
          <div className="flex flex-col gap-1">
            {mock.caseRows.map((row) => (
              <CaseRow key={row.reference} row={row} />
            ))}
          </div>
        </div>
      </section>
    </article>
  )
}