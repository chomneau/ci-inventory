import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '@renderer/features/auth/AuthProvider'
import { unwrap } from '@renderer/lib/ipc'
import { UpdateBanner } from '@renderer/features/admin/updates'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  const { setStatus } = useAuth()

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
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <UpdateBanner />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
