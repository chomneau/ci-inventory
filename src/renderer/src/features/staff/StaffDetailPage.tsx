import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { IdCard, KeyRound, PackageOpen, Pencil, ShieldCheck } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { EmptyState, Page, StatStrip, Table, Td, Th } from '@renderer/components/ui/page'
import { useCanWrite, useMovementPages } from '@renderer/features/inventory/hooks'
import { MovementDetails, SignedQuantity } from '@renderer/features/inventory/parts'
import { useFormat } from '@renderer/lib/format'
import { useStaffMember } from './hooks'
import { BadgeDialog, PinStatus, SetPinDialog, StaffAvatar, StaffFormDialog } from './parts'

const PAGE = 50

/** One person's record: profile, PIN status and every item they have received (the proof trail). */
export function StaffDetailPage() {
  const { t } = useTranslation()
  const { number, dateTime, name } = useFormat()
  const canWrite = useCanWrite()
  const id = Number(useParams().id)
  const { data: member, isError } = useStaffMember(id)
  const { data, hasNextPage, fetchNextPage, isFetching } = useMovementPages({ staffId: id }, PAGE)
  const received = useMemo(() => data?.pages.flat() ?? [], [data])
  const [dialog, setDialog] = useState<'edit' | 'pin' | 'badge' | null>(null)

  const last90 = useMemo(() => {
    const since = Date.now() - 90 * 86_400_000
    const rows = received.filter((m) => m.createdAt >= since)
    return { count: rows.length, items: new Set(rows.map((m) => m.itemId)).size }
  }, [received])
  const confirmed = received.filter((m) => m.confirmation === 'pin').length

  if (isError)
    return (
      <Page>
        <EmptyState icon={IdCard} title={t('errors.NOT_FOUND')} />
      </Page>
    )

  return (
    <Page>
      <div className="flex flex-wrap items-start gap-4">
        <StaffAvatar name={member?.name ?? '?'} className="size-14 text-base" />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            {member?.name ?? '…'}
            {member?.archived ? <Badge>{t('items.archived')}</Badge> : null}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="font-mono">{member?.code}</span>
            {member?.department ? <span>{member.department}</span> : null}
            {member ? <PinStatus member={member} /> : null}
          </div>
          {member?.pinSetAt ? (
            <p className="mt-1 text-xs text-muted-foreground">{t('staff.pin.setOnBy', { date: dateTime(member.pinSetAt), name: member.pinSetByName ?? '—' })}</p>
          ) : null}
        </div>
        {canWrite && member ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={member.archived} onClick={() => setDialog('pin')}>
              <KeyRound />
              {member.pinSet ? t('staff.pin.reset') : t('staff.pin.setNow')}
            </Button>
            <Button variant="outline" onClick={() => setDialog('badge')}>
              <IdCard />
              {t('staff.badge.title')}
            </Button>
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil />
              {t('common.edit')}
            </Button>
          </div>
        ) : null}
      </div>

      <StatStrip
        items={[
          { label: t('staff.fields.receipts'), value: number(member?.receipts ?? 0) },
          { label: t('staff.detail.confirmed'), value: number(confirmed) },
          { label: t('staff.detail.last90'), value: number(last90.count) },
          { label: t('staff.detail.items90'), value: number(last90.items) }
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            {t('staff.detail.history')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t('staff.detail.historyHint')}</p>
        </CardHeader>
        <CardContent>
          {received.length === 0 ? (
            <EmptyState icon={PackageOpen} title={t('staff.detail.noneYet')} />
          ) : (
            <Table className="border-0">
              <thead>
                <tr>
                  <Th>{t('stock.fields.date')}</Th>
                  <Th>{t('stock.fields.item')}</Th>
                  <Th className="text-right">{t('stock.fields.quantity')}</Th>
                  <Th className="hidden @5xl:table-cell">{t('stock.fields.location')}</Th>
                  <Th className="hidden @2xl:table-cell">{t('stock.fields.details')}</Th>
                </tr>
              </thead>
              <tbody>
                {received.map((m) => (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap text-muted-foreground">
                      {dateTime(m.createdAt)}
                      <div className="font-mono text-[11px]">#{m.id}</div>
                    </Td>
                    <Td>
                      <div className="truncate font-medium">{name({ nameEn: m.itemNameEn, nameKm: m.itemNameKm })}</div>
                      <div className="font-mono text-xs text-muted-foreground">{m.sku}</div>
                    </Td>
                    <Td className="text-right">
                      <SignedQuantity value={m.quantity} unit={m.unit} />
                    </Td>
                    <Td className="hidden @5xl:table-cell">{m.locationName}</Td>
                    <Td className="hidden max-w-72 @2xl:table-cell">
                      <MovementDetails movement={{ ...m, staffId: null, issuedTo: null }} showAuthor />
                      {m.confirmation === 'pin' ? (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-[#2f7a2a] dark:text-ci-green">
                          <ShieldCheck className="size-3" />
                          {t('stock.confirm.confirmedTitle')}
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {hasNextPage ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" disabled={isFetching} onClick={() => void fetchNextPage()}>
                {t('stock.loadMore')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {member && dialog === 'edit' ? <StaffFormDialog member={member} onClose={() => setDialog(null)} /> : null}
      {member && dialog === 'pin' ? <SetPinDialog member={member} onClose={() => setDialog(null)} /> : null}
      {member && dialog === 'badge' ? <BadgeDialog member={member} onClose={() => setDialog(null)} /> : null}
    </Page>
  )
}
