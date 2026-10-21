import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
import { passwordIssues, PASSWORD_MIN_LENGTH, type PasswordIssue } from '@shared/auth'
import { cn } from '@renderer/lib/utils'

const RULES: { issue: PasswordIssue; key: string }[] = [
  { issue: 'too_short', key: 'auth.rules.length' },
  { issue: 'too_simple', key: 'auth.rules.variety' },
  { issue: 'too_common', key: 'auth.rules.common' },
  { issue: 'contains_email', key: 'auth.rules.email' }
]

export function isPasswordAcceptable(password: string, email?: string): boolean {
  return passwordIssues(password, email).length === 0
}

/** Live feedback for the same policy the main process enforces. */
export function PasswordChecklist({ password, email }: { password: string; email?: string }) {
  const { t } = useTranslation()
  const issues = new Set(passwordIssues(password, email))
  return (
    <ul className="space-y-1 text-xs">
      {RULES.map(({ issue, key }) => {
        const ok = password.length > 0 && !issues.has(issue)
        const Icon = ok ? Check : X
        return (
          <li key={issue} className={cn('flex items-center gap-1.5', ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
            <Icon className="size-3.5" />
            {t(key, { min: PASSWORD_MIN_LENGTH })}
          </li>
        )
      })}
    </ul>
  )
}
