import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppLayout } from './components/layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'
import { AdminOnly } from './features/admin/AdminOnly'
import { AuditPage } from './features/admin/AuditPage'
import { UsersPage } from './features/admin/UsersPage'
import { AuthGate } from './features/auth/AuthGate'
import { AuthProvider } from './features/auth/AuthProvider'
import { CategoriesPage } from './features/inventory/CategoriesPage'
import { ItemDetailPage } from './features/inventory/ItemDetailPage'
import { ItemsPage } from './features/inventory/ItemsPage'
import { LocationsPage } from './features/inventory/LocationsPage'
import { MovementsPage } from './features/inventory/MovementsPage'
import { StaffDetailPage } from './features/staff/StaffDetailPage'
import { StaffPage } from './features/staff/StaffPage'
import { QueryProvider } from './lib/query'
import { StepUpProvider } from './lib/step-up'
import { useTheme } from './lib/theme'

export function App() {
  const { isDark } = useTheme()
  return (
    <AuthProvider>
      <AuthGate>
        <QueryProvider>
          <StepUpProvider>
            <HashRouter>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="items" element={<ItemsPage />} />
                  <Route path="items/:id" element={<ItemDetailPage />} />
                  <Route path="stock" element={<MovementsPage />} />
                  <Route path="staff" element={<StaffPage />} />
                  <Route path="staff/:id" element={<StaffDetailPage />} />
                  <Route path="categories" element={<CategoriesPage />} />
                  <Route path="locations" element={<LocationsPage />} />
                  <Route path="users" element={<AdminOnly><UsersPage /></AdminOnly>} />
                  <Route path="audit" element={<AdminOnly><AuditPage /></AdminOnly>} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </HashRouter>
          </StepUpProvider>
        </QueryProvider>
      </AuthGate>
      <Toaster position="bottom-right" richColors closeButton theme={isDark ? 'dark' : 'light'} />
    </AuthProvider>
  )
}
