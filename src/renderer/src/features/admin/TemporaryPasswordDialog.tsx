import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, TriangleAlert } from 'lucide-react'
import type { TemporaryPassword } from '@shared/admin'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'

/** Shows a temporary password exactly once. It is never stored and cannot be shown again. */
export function TemporaryPasswordDialog({ value, onClose }: { value: TemporaryPassword; onClose: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('users.tempTitle')}
      description={t('users.tempFor', { email: value.email })}
      footer={<Button onClick={onClose}>{t('users.tempDone')}</Button>}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border bg-muted/50 p-4">
          <code className="flex-1 select-all text-center font-mono text-xl tracking-wider">{value.temporaryPassword}</code>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('common.copy')}
            onClick={async () => {
              await navigator.clipboard.writeText(value.temporaryPassword)
              setCopied(true)
            }}
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t('users.tempWarning')}
        </div>
      </div>
    </Dialog>
  )
}
