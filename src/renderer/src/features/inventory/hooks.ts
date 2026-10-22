import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import type { Movement } from '@shared/inventory'
import { unwrap } from '@renderer/lib/ipc'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'

export const keys = {
  categories: ['categories'] as const,
  locations: (includeArchived: boolean) => ['locations', includeArchived] as const,
  items: (q: object) => ['items', q] as const,
  item: (id: number) => ['item', id] as const,
  photo: (id: number, variant: string) => ['photo', id, variant] as const,
  movements: (q: object) => ['movements', q] as const,
  dashboard: ['dashboard'] as const
}

export function useCategories() {
  return useQuery({ queryKey: keys.categories, queryFn: () => unwrap(window.ci.categories.list()) })
}

export function useLocations(includeArchived = false) {
  return useQuery({ queryKey: keys.locations(includeArchived), queryFn: () => unwrap(window.ci.locations.list({ includeArchived })) })
}

export function useItems(q: { search?: string; categoryId?: number | null; lowStockOnly?: boolean; includeArchived?: boolean } = {}) {
  return useQuery({ queryKey: keys.items(q), queryFn: () => unwrap(window.ci.items.list(q)) })
}

export function useItem(id: number) {
  return useQuery({ queryKey: keys.item(id), queryFn: () => unwrap(window.ci.items.get({ id })), enabled: id > 0 })
}

export function usePhoto(id: number, variant: 'image' | 'thumbnail', enabled: boolean) {
  return useQuery({
    queryKey: keys.photo(id, variant),
    queryFn: () => unwrap(window.ci.items.photo({ id, variant })),
    enabled
  })
}

export function useMovements(q: { itemId?: number | null; type?: Movement['type']; search?: string; limit?: number } = {}) {
  // Keep showing the previous rows while a new search / page loads, so the table doesn't flash empty.
  return useQuery({ queryKey: keys.movements(q), queryFn: () => unwrap(window.ci.stock.list(q)), placeholderData: keepPreviousData })
}

/** Paged ledger for the movements screen: each page is fetched with an offset, so history of any length loads. */
export function useMovementPages(q: { type?: Movement['type']; search?: string }, pageSize: number) {
  return useInfiniteQuery({
    queryKey: keys.movements({ ...q, paged: pageSize }),
    queryFn: ({ pageParam }) => unwrap(window.ci.stock.list({ ...q, limit: pageSize, offset: pageParam })),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length < pageSize ? undefined : all.length * pageSize),
    placeholderData: keepPreviousData
  })
}

export function useDashboard() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => unwrap(window.ci.dashboard.summary()) })
}

/** UI hint only — main enforces the same roles on every write. */
export function useCanWrite(): boolean {
  return useCurrentUser().role !== 'viewer'
}
