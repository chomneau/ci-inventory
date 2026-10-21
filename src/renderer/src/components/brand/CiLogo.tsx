import { cn } from '@renderer/lib/utils'

// Official CI artwork dropped into assets/brand/ is bundled automatically (see README there).
const files = import.meta.glob<string>('../../assets/brand/ci-*.{svg,png}', {
  eager: true,
  query: '?url',
  import: 'default'
})

function find(name: string): string | undefined {
  const key = Object.keys(files).find((path) => path.includes(`/${name}.`))
  return key ? files[key] : undefined
}

const symbol = find('ci-symbol')

/** The official CI symbol (blue circle + green bar), never redrawn in code. */
export function CiSymbol({ className }: { className?: string }) {
  if (!symbol) return null
  return <img src={symbol} alt="Conservation International" className={cn('h-10 w-auto', className)} draggable={false} />
}

/**
 * Brand mark for the app chrome. Uses the full official lockup when its files are
 * present (ci-logo-color / ci-logo-white); otherwise the official symbol beside
 * the product name in plain UI type — never an imitation of the CI wordmark.
 */
export function CiLogo({ variant, className, subtitle = 'CI Cambodia' }: { variant: 'color' | 'white'; className?: string; subtitle?: string }) {
  const lockup = find(`ci-logo-${variant}`)
  if (lockup) {
    return <img src={lockup} alt="Conservation International Cambodia" className={cn('h-10 w-auto min-w-[86px]', className)} draggable={false} />
  }
  return (
    <div className={cn('flex h-10 items-center gap-3', className)}>
      <CiSymbol className="h-full" />
      <div className={cn('leading-tight', variant === 'white' ? 'text-white' : 'text-foreground')}>
        <div className="text-base font-semibold tracking-tight">CI Inventory</div>
        <div className={cn('text-xs', variant === 'white' ? 'text-white/70' : 'text-muted-foreground')}>{subtitle}</div>
      </div>
    </div>
  )
}
