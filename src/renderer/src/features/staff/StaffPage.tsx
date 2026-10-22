import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, IdCard, KeyRound, Pencil, Plus, Search, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import type { StaffMember } from '@shared/staff'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, Page, PageHeader, SortTh, StatStrip, Table, Td, Th, Toolbar, sortRows, type SortDir } from '@renderer/components/ui/page'
import { useCanWrite } from '@renderer/features/inventory/hooks'
import { useFormat } from '@renderer/lib/format'
import { unwrap, useErrorText } from '@renderer/lib/ipc'
import { useStaff } from './hooks'
import { BadgeDialog, PinStatus, SetPinDialog, StaffAvatar, StaffFormDialog } from './parts'

type SortKey = 'name' | 'department' | 'receipts' | 'last'
type Dialog = { kind: 'form'; member: StaffMember | null } | { kind: 'pin' | 'badge'; member: StaffMember }

export function StaffPage() {
  const { t } = useTranslation()
  const { number, dateTime } = useFormat()
  const errorText = useErrorText()
  const canWrite = useCanWrite()
  const navigate = useNavigate()
  const [showArchived, setShowArchived] = useState(false)
  const { data: staff, isLoading } = useStaff(showArchived)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const [dialog, setDialog] = useState<Dialog | null>(null)

  const active = (staff ?? []).filter((s) => !s.archived)
  const summary = {
    total: active.length,
    ready: active.filter((s) => s.pinSet && !s.pinLocked).length,
    noPin: active.filter((s) => !s.pinSet).length,
    locked: active.filter((s) => s.pinLocked).length
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = (staff ?? []).filter((s) => !q || [s.name, s.code, s.department].some((v) => v?.toLowerCase().includes(q)))
    const get = (s: StaffMember) =>
      sort.key === 'name' ? s.name.toLowerCase() : sort.key === 'department' ? (s.department ?? '').toLowerCase() : sort.key === 'receipts' ? s.receipts : (s.lastReceiptAt ?? 0)
    return sortRows(filtered, get, sort.dir)
  }, [staff, search, sort])

  const setArchived = (s: StaffMember, archived: boolean) =>
    unwrap(window.ci.staff.setArchived({ id: s.id, archived }))
      .then(() => toast.success(archived ? t('staff.archived', { name: s.name }) : t('staff.restored', { name: s.name })))
      .catch((e: unknown) => toast.error(errorText(e)))

  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  return (
    <Page>
      <PageHeader
        icon={IdCard}
        title={t('nav.staff')}
        description={t('staff.subtitle')}
        actions={
          canWrite ? (
            <Button onClick={() => setDialog({ kind: 'form', member: null })}>
              <Plus />
              {t('staff.new')}
            </Button>
          ) : undefined
        }
      />
      <StatStrip
        items={[
          { label: t('staff.summary.total'), value: number(summary.total) },
          { label: t('staff.summary.ready'), value: number(summary.ready) },
          { label: t('staff.summary.noPin'), value: number(summary.noPin), tone: summary.noPin ? 'warning' : undefined },
          { label: t('staff.summary.locked'), value: number(summary.locked), tone: summary.locked ? 'critical' : undefined }
        ]}
      />
      <Toolbar>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder={t('staff.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" className="size-4 accent-[#0279B4]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t('items.showArchived')}
        </label>
      </Toolbar>

      {!isLoading && rows.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState
            icon={UserRound}
            title={search ? t('staff.noMatches') : t('staff.empty')}
            body={search ? undefined : t('staff.emptyBody')}
            action={
              canWrite && !search ? (
                <Button onClick={() => setDialog({ kind: 'form', member: null })}>
                  <Plus />
                  {t('staff.new')}
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <SortTh label={t('staff.fields.name')} column="name" sort={sort} onSort={onSort} />
              <SortTh label={t('staff.fields.department')} column="department" sort={sort} onSort={onSort} className="hidden @2xl:table-cell" />
              <Th>{t('staff.fields.pin')}</Th>
              <SortTh label={t('staff.fields.receipts')} column="receipts" sort={sort} onSort={onSort} align="right" className="hidden @3xl:table-cell" />
              <SortTh label={t('staff.fields.lastReceipt')} column="last" sort={sort} onSort={onSort} className="hidden @4xl:table-cell" />
              {canWrite ? <Th className="w-40" /> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr
                key={s.id}
                tabIndex={0}
                className={`cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none ${s.archived ? 'opacity-60' : ''}`}
                onClick={() => navigate(`/staff/${s.id}`)}
                onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(`/staff/${s.id}`)}
              >
                <Td>
                  <div className="flex items-center gap-3">
                    <StaffAvatar name={s.name} />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {s.name} {s.archived ? <Badge className="ml-1">{t('items.archived')}</Badge> : null}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">{s.code}</div>
                    </div>
                  </div>
                </Td>
                <Td className="hidden text-muted-foreground @2xl:table-cell">{s.department ?? '—'}</Td>
                <Td>
                  <PinStatus member={s} />
                </Td>
                <Td className="hidden text-right tabular-nums @3xl:table-cell">{number(s.receipts)}</Td>
                <Td className="hidden text-muted-foreground @4xl:table-cell">{s.lastReceiptAt ? dateTime(s.lastReceiptAt) : '—'}</Td>
                {canWrite ? (
                  <Td className="whitespace-nowrap text-right">
                    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
                      <Button size="icon" variant="ghost" aria-label={s.pinSet ? t('staff.pin.reset') : t('staff.pin.setNow')} title={s.pinSet ? t('staff.pin.reset') : t('staff.pin.setNow')} disabled={s.archived} onClick={() => setDialog({ kind: 'pin', member: s })}>
                        <KeyRound />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={t('staff.badge.title')} title={t('staff.badge.title')} onClick={() => setDialog({ kind: 'badge', member: s })}>
                        <IdCard />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={t('common.edit')} title={t('common.edit')} onClick={() => setDialog({ kind: 'form', member: s })}>
                        <Pencil />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={s.archived ? t('items.restore') : t('items.archive')} title={s.archived ? t('items.restore') : t('items.archive')} onClick={() => void setArchived(s, !s.archived)}>
                        {s.archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                    </span>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {dialog?.kind === 'form' ? (
        <StaffFormDialog
          member={dialog.member}
          onClose={() => setDialog(null)}
          // A new person chooses their PIN straight away, while they are at the desk.
          onSaved={(m) => (dialog.member ? undefined : setTimeout(() => setDialog({ kind: 'pin', member: m }), 0))}
        />
      ) : null}
      {dialog?.kind === 'pin' ? <SetPinDialog member={dialog.member} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'badge' ? <BadgeDialog member={dialog.member} onClose={() => setDialog(null)} /> : null}
    </Page>
  )
}
