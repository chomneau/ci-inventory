import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, type LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

/**
 * The one page frame used everywhere: same width, same left edge, same rhythm.
 * `@container` lets content adapt to the space actually available (sidebar open or not).
 */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('@container mx-auto w-full max-w-[1600px] space-y-5', className)}>{children}</div>
}

export function PageHeader({
  title,
  description,
  actions,
  icon: Icon
}: {
  title: string
  description?: string
  actions?: ReactNode
  icon?: LucideIcon
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon ? (
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground ring-1 ring-ci-blue/15">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-light tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Row of small headline numbers above a list (count, value, alerts). */
export function StatStrip({ items }: { items: { label: string; value: string; tone?: 'critical' | 'warning'; onClick?: () => void }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border @3xl:grid-cols-4">
      {items.map((s) => {
        const Tag = s.onClick ? 'button' : 'div'
        return (
          <Tag
            key={s.label}
            type={s.onClick ? 'button' : undefined}
            onClick={s.onClick}
            className={cn('bg-card px-5 py-3.5 text-left', s.onClick && 'transition-colors hover:bg-muted/60')}
          >
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div
              className={cn(
                'mt-0.5 text-xl font-semibold',
                s.tone === 'critical' && 'text-[var(--status-critical)]',
                s.tone === 'warning' && 'text-amber-600 dark:text-amber-400'
              )}
            >
              {s.value}
            </div>
          </Tag>
        )
      })}
    </div>
  )
}

/** Filter/search row above a list. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <div className="font-medium">{title}</div>
        {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      </div>
      {action}
    </div>
  )
}

/** Data table shell: rounded card, sticky header, horizontal scroll only as a last resort. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border bg-card shadow-xs', className)}>
      <table className="w-full border-separate border-spacing-0 text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'sticky top-0 z-[1] border-b bg-muted/70 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur',
        className
      )}
    >
      {children}
    </th>
  )
}

export type SortDir = 'asc' | 'desc'

/** Column header that sorts on click; announces the state to screen readers. */
export function SortTh<K extends string>({
  label,
  column,
  sort,
  onSort,
  className,
  align = 'left'
}: {
  label: string
  column: K
  sort: { key: K; dir: SortDir }
  onSort: (key: K) => void
  className?: string
  align?: 'left' | 'right'
}) {
  const active = sort.key === column
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('sticky top-0 z-[1] border-b bg-muted/70 p-0 backdrop-blur', className)}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'flex w-full items-center gap-1 px-4 py-2.5 text-xs font-medium uppercase tracking-wide transition-colors hover:text-foreground',
          align === 'right' && 'justify-end',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-40')} aria-hidden="true" />
      </button>
    </th>
  )
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b px-4 py-3 align-middle', className)}>{children}</td>
}

/** Generic, stable sort for table rows. */
export function sortRows<T>(rows: T[], get: (row: T) => string | number, dir: SortDir): T[] {
  const factor = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = get(a)
    const y = get(b)
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * factor
  })
}
