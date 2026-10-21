import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { unwrap } from '@renderer/lib/ipc'
import { readPreference, writePreference } from '@renderer/lib/utils'
import { UpdateBanner } from '@renderer/features/admin/updates'
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

  // Ctrl/Cmd+L locks the app immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        void unwrap(window.ci.auth.lock()).then(setStatus)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setStatus])

  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <UpdateBanner />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
