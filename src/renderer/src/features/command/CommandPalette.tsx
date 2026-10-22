import * as RadixDialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, ClipboardCheck, CornerDownLeft, Package, PackagePlus, Search, type LucideIcon } from 'lucide-react'
import { ALL_NAV_ITEMS } from '@renderer/components/layout/nav'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'
import { useCanWrite, useItems } from '@renderer/features/inventory/hooks'
import type { MovementKind } from '@renderer/features/inventory/MovementDialog'
import { useFormat } from '@renderer/lib/format'
import { cn } from '@renderer/lib/utils'

export type PaletteAction = { type: 'movement'; kind: MovementKind } | { type: 'newItem' }

interface Entry {
  id: string
  group: 'actions' | 'pages' | 'items'
  label: string
  hint?: string
  icon: LucideIcon
  keywords: string
  run: () => void
}

/**
 * ⌘K / Ctrl+K: find any item by name, SKU or Khmer name, jump to any page the
 * user may see, or start a stock action — all from the keyboard.
 */
export function CommandPalette({ open, onOpenChange, onAction }: { open: boolean; onOpenChange: (o: boolean) => void; onAction: (a: PaletteAction) => void }) {
  const { t } = useTranslation()
  const { name } = useFormat()
  const navigate = useNavigate()
  const { role } = useCurrentUser()
  const canWrite = useCanWrite()
  const { data: items = [] } = useItems({})
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
    }
  }, [open])

  const entries = useMemo<Entry[]>(() => {
    const close = (fn: () => void) => () => {
      onOpenChange(false)
      fn()
    }
    const actions: Entry[] = canWrite
      ? (
          [
            ['in', ArrowDownToLine],
            ['out', ArrowUpFromLine],
            ['transfer', ArrowLeftRight],
            ['adjust', ClipboardCheck]
          ] as [MovementKind, LucideIcon][]
        )
          .map(([kind, icon]) => ({
            id: `a-${kind}`,
            group: 'actions' as const,
            label: t(`stock.actions.${kind}`),
            icon,
            keywords: `${kind} stock`,
            run: close(() => onAction({ type: 'movement', kind }))
          }))
          .concat([{ id: 'a-new', group: 'actions', label: t('items.new'), icon: PackagePlus, keywords: 'new item add create', run: close(() => onAction({ type: 'newItem' })) }])
      : []
    const pages: Entry[] = ALL_NAV_ITEMS.filter((n) => !n.roles || n.roles.includes(role)).map((n) => ({
      id: `p-${n.to}`,
      group: 'pages',
      label: t(n.labelKey),
      icon: n.icon,
      keywords: n.to,
      run: close(() => navigate(n.to))
    }))
    const itemEntries: Entry[] = items.map((i) => ({
      id: `i-${i.id}`,
      group: 'items',
      label: name(i),
      hint: `${i.sku} · ${i.onHand} ${i.unit}`,
      icon: Package,
      keywords: `${i.sku} ${i.nameEn} ${i.nameKm ?? ''}`,
      run: close(() => navigate(`/items/${i.id}`))
    }))
    return [...actions, ...pages, ...itemEntries]
  }, [canWrite, items, name, navigate, onAction, onOpenChange, role, t])

  const q = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!q) return entries.filter((e) => e.group !== 'items').concat(entries.filter((e) => e.group === 'items').slice(0, 5))
    const match = entries.filter((e) => `${e.label} ${e.keywords}`.toLowerCase().includes(q))
    return [...match.filter((e) => e.group !== 'items'), ...match.filter((e) => e.group === 'items').slice(0, 12)]
  }, [entries, q])

  useEffect(() => setActive(0), [q])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1))
    else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1))
    else if (e.key === 'Enter') results[active]?.run()
    else return
    e.preventDefault()
  }

  let lastGroup = ''
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-ci-navy/40 backdrop-blur-[2px]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(92vw,38rem)] -translate-x-1/2 overflow-hidden rounded-2xl border bg-card shadow-2xl focus:outline-none"
          onKeyDown={onKey}
        >
          <RadixDialog.Title className="sr-only">{t('palette.title')}</RadixDialog.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('palette.placeholder')}
              aria-label={t('palette.placeholder')}
              aria-controls="palette-results"
              aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
              className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
          </div>
          <ul ref={listRef} id="palette-results" role="listbox" className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
            {results.length === 0 ? <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t('palette.noResults')}</li> : null}
            {results.map((e, i) => {
              const header = e.group !== lastGroup ? t(`palette.groups.${e.group}`) : null
              lastGroup = e.group
              return (
                <li key={e.id} role="presentation">
                  {header ? <div className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{header}</div> : null}
                  <div
                    id={`palette-${e.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onPointerMove={() => setActive(i)}
                    onClick={e.run}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm', i === active ? 'bg-accent text-accent-foreground' : '')}
                  >
                    <e.icon className="size-4 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{e.label}</span>
                    {e.hint ? <span className="shrink-0 font-mono text-xs text-muted-foreground">{e.hint}</span> : null}
                    {i === active ? <CornerDownLeft className="size-3.5 shrink-0 opacity-60" /> : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
