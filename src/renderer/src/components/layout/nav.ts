import {
  ArrowLeftRight,
  IdCard,
  LayoutDashboard,
  MapPin,
  Package,
  ScrollText,
  Settings,
  Tags,
  Users,
  type LucideIcon
} from 'lucide-react'
import type { Role } from '@shared/auth'

export interface NavItem {
  to: string
  labelKey: string
  icon: LucideIcon
  /** Roles that may see this item; omit for everyone. (Main enforces access regardless.) */
  roles?: readonly Role[]
}

export const NAV_SECTIONS: { titleKey: string; items: NavItem[] }[] = [
  {
    titleKey: 'nav.main',
    items: [{ to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard }]
  },
  {
    titleKey: 'nav.inventory',
    items: [
      { to: '/items', labelKey: 'nav.items', icon: Package },
      { to: '/stock', labelKey: 'nav.stock', icon: ArrowLeftRight },
      { to: '/staff', labelKey: 'nav.staff', icon: IdCard },
      { to: '/categories', labelKey: 'nav.categories', icon: Tags },
      { to: '/locations', labelKey: 'nav.locations', icon: MapPin }
    ]
  },
  {
    titleKey: 'nav.admin',
    items: [
      { to: '/users', labelKey: 'nav.users', icon: Users, roles: ['admin'] },
      { to: '/audit', labelKey: 'nav.audit', icon: ScrollText, roles: ['admin'] },
      { to: '/settings', labelKey: 'nav.settings', icon: Settings }
    ]
  }
]

export const ALL_NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items)
