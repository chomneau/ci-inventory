import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { unwrap } from '@renderer/lib/ipc'
import { readPreference, writePreference } from '@renderer/lib/utils'
import { UpdateBanner } from '@renderer/features/admin/updates'
import { CommandPalette, type PaletteAction } from '@renderer/features/command/CommandPalette'
import { ItemFormDialog } from '@renderer/features/inventory/ItemFormDialog'
import { MovementDialog } from '@renderer/features/inventory/MovementDialog'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/** Below this window width the sidebar starts collapsed to icons, so content keeps its room. */
const COMPACT_WIDTH = 1200

function initialCollapsed(): boolean {
  const saved = readPreference('ci.sidebar')
  return saved ? saved === 'collapsed' : window.innerWidth < COMPACT_WIDTH
}

export function AppLayout() {
  const { setStatus } = useAuth()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [action, setAction] = useState<PaletteAction | null>(null)

  // Until the user picks a state, the sidebar follows the window width.
  useEffect(() => {
    const onResize = () => {
      if (!readPreference('ci.sidebar')) setCollapsed(window.innerWidth < COMPACT_WIDTH)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const toggle = () =>
    setCollapsed((c) => {
      writePreference('ci.sidebar', c ? 'expanded' : 'collapsed')
      return !c
    })

  // Ctrl/Cmd+L locks the app immediately; Ctrl/Cmd+K opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'l') {
        e.preventDefault()
        void unwrap(window.ci.auth.lock()).then(setStatus)
      } else if (key === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setStatus])

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onSearch={() => setPaletteOpen(true)} />
        <UpdateBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onAction={setAction} />
        {action?.type === 'movement' ? <MovementDialog open onOpenChange={(o) => !o && setAction(null)} kind={action.kind} /> : null}
        {action?.type === 'newItem' ? <ItemFormDialog open onOpenChange={(o) => !o && setAction(null)} /> : null}
      </div>
    </div>
  )
}
