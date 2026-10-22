import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive, ArchiveRestore, MapPin, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Location } from '@shared/inventory'
import { Alert } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, Page, PageHeader, Table, Td, Th } from '@renderer/components/ui/page'
import { Textarea } from '@renderer/components/ui/textarea'
import { useFormat } from '@renderer/lib/format'
import { unwrap, useAction, useErrorText } from '@renderer/lib/ipc'
import { useCanWrite, useLocations } from './hooks'

function LocationDialog({ location, onClose }: { location: Location | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { run, pending, error } = useAction({ DUPLICATE: t('locations.duplicate') })
  const [name, setName] = useState(location?.name ?? '')
  const [description, setDescription] = useState(location?.description ?? '')
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run(async () => {
      if (location) await unwrap(window.ci.locations.update({ id: location.id, name, description: description || null }))
      else await unwrap(window.ci.locations.create({ name, description: description || null }))
      return true
    })
    if (ok) {
      toast.success(t('common.saved'))
      onClose()
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={location ? t('locations.edit') : t('locations.new')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="location-form" disabled={pending || !name.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="location-form" onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t('locations.name')} htmlFor="loc-name">
          <Input id="loc-name" autoFocus required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('locations.namePlaceholder')} />
        </Field>
        <Field label={t('locations.description')} htmlFor="loc-desc">
          <Textarea id="loc-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}

export function LocationsPage() {
  const { t } = useTranslation()
  const { number, money } = useFormat()
  const errorText = useErrorText()
  const canWrite = useCanWrite()
  const { data: locations, isLoading } = useLocations(true)
  const [editing, setEditing] = useState<Location | null | 'new'>(null)

  const setArchived = (l: Location, archived: boolean) =>
    unwrap(window.ci.locations.setArchived({ id: l.id, archived }))
      .then(() => toast.success(archived ? t('locations.archived') : t('locations.restored')))
      .catch((e: unknown) => toast.error(errorText(e)))

  return (
    <Page>
      <PageHeader
        icon={MapPin}
        title={t('nav.locations')}
        description={t('locations.subtitle')}
        actions={
          canWrite ? (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              {t('locations.new')}
            </Button>
          ) : undefined
        }
      />
      {!isLoading && locations?.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={MapPin} title={t('locations.empty')} body={t('locations.emptyBody')} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('locations.name')}</Th>
              <Th className="hidden @3xl:table-cell">{t('locations.description')}</Th>
              <Th className="text-right">{t('locations.itemsHeld')}</Th>
              <Th className="text-right">{t('items.fields.value')}</Th>
              {canWrite ? <Th className="w-28" /> : null}
            </tr>
          </thead>
          <tbody>
            {(locations ?? []).map((l) => (
              <tr key={l.id} className={l.archived ? 'opacity-60' : undefined}>
                <Td className="font-medium">
                  {l.name} {l.archived ? <Badge className="ml-2">{t('items.archived')}</Badge> : null}
                </Td>
                <Td className="hidden text-muted-foreground @3xl:table-cell">{l.description ?? '—'}</Td>
                <Td className="text-right tabular-nums">{number(l.itemCount)}</Td>
                <Td className="text-right tabular-nums">{money(l.valueCents)}</Td>
                {canWrite ? (
                  <Td className="text-right">
                    <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing(l)}>
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={l.archived ? t('items.restore') : t('items.archive')}
                      onClick={() => void setArchived(l, !l.archived)}
                    >
                      {l.archived ? <ArchiveRestore /> : <Archive />}
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing ? <LocationDialog location={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Page>
  )
}
