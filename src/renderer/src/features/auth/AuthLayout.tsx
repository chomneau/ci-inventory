import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, Lock, ShieldCheck, WifiOff } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { CiLogo } from '@renderer/components/brand/CiLogo'
import { InventoryPattern } from './art/InventoryPattern'
import { KhmerFlower } from './art/KhmerFlower'

/**
 * Sign-in frame in the Conservation International identity: a deep navy → CI
 * blue gradient ground (guidelines 1.16 / 1.19) textured with a Khmer flower
 * pattern, and a clean form card finished with the CI green bar (as on CI letterhead).
 */
export function AuthLayout({
  title,
  subtitle,
  eyebrow,
  children
}: {
  title: string
  subtitle?: ReactNode
  /** Small Khmer greeting above the title, e.g. "សូមស្វាគមន៍". */
  eyebrow?: string
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const features = [
    { icon: Lock, text: t('auth.brand.encrypted') },
    { icon: ShieldCheck, text: t('auth.brand.twoStep') },
    { icon: WifiOff, text: t('auth.brand.offline') }
  ]

  return (
    <div className="flex h-full bg-background">
      {/* ---------- Brand panel ---------- */}
      <aside className="bg-ci-gradient relative hidden w-[46%] max-w-2xl flex-col justify-between overflow-hidden p-10 text-white lg:flex">
        <InventoryPattern className="pointer-events-none absolute inset-0 size-full text-white opacity-[0.09]" />
        <KhmerFlower
          className="animate-slow-spin pointer-events-none absolute -bottom-48 -right-48 size-[36rem] text-white/15"
          strokeWidth={0.7}
        />

        <CiLogo variant="white" className="relative h-12" />

        <div className="animate-rise-in relative max-w-md space-y-5">
          <div className="text-xs font-medium uppercase tracking-[0.35em] text-white/70">CI Cambodia</div>
          <h2 className="text-[2.6rem] font-light leading-[1.1] tracking-tight">{t('auth.brand.appTitle')}</h2>
          <p className="font-khmer text-xl font-semibold text-white/90">ប្រព័ន្ធគ្រប់គ្រងសារពើភ័ណ្ឌ</p>
          <div className="h-1.5 w-16 bg-ci-green" />
          <p className="leading-relaxed text-white/75">{t('auth.brand.headline')}</p>
        </div>

        <div className="relative space-y-4">
          <p className="text-lg font-bold">{t('auth.brand.tagline')}</p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/70">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="size-3.5 text-ci-green" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ---------- Form panel ---------- */}
      <main className="relative flex flex-1 overflow-y-auto p-6">
        <InventoryPattern className="pointer-events-none absolute inset-0 size-full text-ci-blue opacity-[0.06]" />
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-4 top-4 z-10 text-muted-foreground"
          onClick={() => void i18n.changeLanguage(i18n.language === 'km' ? 'en' : 'km')}
        >
          <Languages />
          {i18n.language === 'km' ? 'English' : 'ខ្មែរ'}
        </Button>

        <div className="animate-rise-in relative m-auto w-full max-w-md py-10" style={{ animationDelay: '0.1s' }}>
          {/* Logo for narrow windows, where the brand panel is hidden */}
          <CiLogo variant="color" className="mb-6 lg:hidden" />

          <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_24px_60px_-24px_rgb(11_31_53/0.35)]">
            <div className="p-8">
              <div className="mb-6 space-y-1.5">
                {eyebrow ? <div className="font-khmer text-sm font-semibold text-ci-blue-deep dark:text-ci-blue">{eyebrow}</div> : null}
                <h1 className="text-3xl font-light tracking-tight">{title}</h1>
                {subtitle ? <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
              </div>
              <div className="space-y-6">{children}</div>
            </div>
            {/* CI green bar, as at the foot of CI letterhead */}
            <div className="h-1.5 bg-ci-green" />
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">© Conservation International Cambodia</p>
        </div>
      </main>
    </div>
  )
}
