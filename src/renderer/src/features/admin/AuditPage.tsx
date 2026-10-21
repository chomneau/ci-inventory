import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Search, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { PageHeader, Table, Td, Th } from '@renderer/components/ui/page'
import { useFormat } from '@renderer/lib/format'
import { unwrap } from '@renderer/lib/ipc'
import { useAudit } from './hooks'

function DetailsCell({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details)
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className="line-clamp-2 font-mono text-xs text-muted-foreground" title={JSON.stringify(details, null, 2)}>
      {entries.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
    </span>
  )
}

export function AuditPage() {
  const { t } = useTranslation()
  const { dateTime } = useFormat()
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const h = setTimeout(() => setSearch(text.trim()), 250)
    return () => clearTimeout(h)
  }, [text])
  const { data: entries = [] } = useAudit({ search: search || undefined })
  const verify = useMutation({ mutationFn: () => unwrap(window.ci.audit.verify()) })

  const exportCsv = async () => {
    const r = await unwrap(window.ci.audit.exportCsv()).catch(() => null)
    if (r?.saved) toast.success(t('export.saved', { file: r.fileName }))
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={t('nav.audit')}
        description={t('audit.subtitle')}
        actions={
          <>
            <Button variant="outline" onClick={() => void exportCsv()}>
              <Download />
              {t('export.csv')}
            </Button>
            <Button onClick={() => verify.mutate()} disabled={verify.isPending}>
              <ShieldCheck />
              {t('audit.verify')}
            </Button>
          </>
        }
      />

      {verify.data ? (
        verify.data.ok ? (
          <Alert variant="success">{t('audit.verifyOk', { count: verify.data.entries })}</Alert>
        ) : (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {t('audit.verifyBroken', { id: verify.data.brokenAtId, reason: t(`audit.reasons.${verify.data.reason}`) })}
          </div>
        )
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder={t('audit.search')} value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      <Table>
        <thead>
          <tr>
            <Th className="w-16">#</Th>
            <Th>{t('stock.fields.date')}</Th>
            <Th>{t('audit.user')}</Th>
            <Th>{t('audit.action')}</Th>
            <Th>{t('stock.fields.details')}</Th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="hover:bg-muted/40">
              <Td className="tabular-nums text-muted-foreground">{e.id}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{dateTime(e.at)}</Td>
              <Td>{e.actorName ?? <span className="text-muted-foreground">{t('audit.system')}</span>}</Td>
              <Td>
                <div>{t(`audit.actions.${e.action}`, { defaultValue: e.action })}</div>
                <div className="font-mono text-xs text-muted-foreground">{e.action}</div>
              </Td>
              <Td className="max-w-md">
                <DetailsCell details={e.details} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}
