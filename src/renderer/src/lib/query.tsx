import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { useEffect, type ReactNode } from 'react'

const client = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false }
  }
})

/** Main pushes "inventory changed" after every mutation; refetch everything that is on screen. */
function InventorySync() {
  const qc = useQueryClient()
  useEffect(() => window.ci.onInventoryChanged(() => void qc.invalidateQueries()), [qc])
  return null
}

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <InventorySync />
      {children}
    </QueryClientProvider>
  )
}

/** Drop cached data on sign-out / lock so the next user never sees it. */
export function clearQueryCache(): void {
  client.clear()
}
