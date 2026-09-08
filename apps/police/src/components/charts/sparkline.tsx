import { cn } from '@pleadli/ui/lib/utils'

type SparklineProps = {
  data: readonly number[]
  className?: string
}

export const Sparkline = ({ data, className }: SparklineProps) => {
  if (data.length < 2) return null

  const width = 100
  const height = 36
  const padding = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width
    const y = height - padding - ((value - min) / range) * (height - padding * 2)
    return [x, y] as const
  })

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ')

  const areaPath =
    `M ${points[0][0].toFixed(2)} ${height} ` +
    linePath.slice(1) +
    ` L ${points[points.length - 1][0].toFixed(2)} ${height} Z`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-12 w-full [&_path]:opacity-100!', className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d={areaPath} fill="currentColor" className="text-primary opacity-10" />
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="text-primary"
      />
    </svg>
  )
}