import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Category } from '@shared/inventory'
import { Alert } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, Page, PageHeader, Table, Td, Th } from '@renderer/components/ui/page'
import { useFormat } from '@renderer/lib/format'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useCanWrite, useCategories } from './hooks'
import { ConfirmDialog } from './parts'

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { run, pending, error } = useAction({ DUPLICATE: t('categories.duplicate') })
  const [nameEn, setNameEn] = useState(category?.nameEn ?? '')
  const [nameKm, setNameKm] = useState(category?.nameKm ?? '')
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run(async () => {
      if (category) await unwrap(window.ci.categories.update({ id: category.id, nameEn, nameKm: nameKm || null }))
      else await unwrap(window.ci.categories.create({ nameEn, nameKm: nameKm || null }))
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
      title={category ? t('categories.edit') : t('categories.new')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="category-form" disabled={pending || !nameEn.trim()}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="category-form" onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field label={t('items.fields.nameEn')} htmlFor="cat-en">
          <Input id="cat-en" autoFocus required maxLength={120} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={t('items.fields.nameKm')} htmlFor="cat-km">
          <Input id="cat-km" maxLength={120} className="font-khmer" value={nameKm} onChange={(e) => setNameKm(e.target.value)} />
        </Field>
      </form>
    </Dialog>
  )
}

export function CategoriesPage() {
  const { t } = useTranslation()
  const { number, money } = useFormat()
  const canWrite = useCanWrite()
  const { data: categories, isLoading } = useCategories()
  const [editing, setEditing] = useState<Category | null | 'new'>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  return (
    <Page>
      <PageHeader
        icon={Tags}
        title={t('nav.categories')}
        description={t('categories.subtitle')}
        actions={
          canWrite ? (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              {t('categories.new')}
            </Button>
          ) : undefined
        }
      />
      {!isLoading && categories?.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Tags} title={t('categories.empty')} body={t('categories.emptyBody')} />
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('items.fields.nameEn')}</Th>
              <Th>{t('items.fields.nameKm')}</Th>
              <Th className="text-right">{t('categories.items')}</Th>
              <Th className="text-right">{t('items.fields.value')}</Th>
              {canWrite ? <Th className="w-24" /> : null}
            </tr>
          </thead>
          <tbody>
            {(categories ?? []).map((c) => (
              <tr key={c.id}>
                <Td className="font-medium">{c.nameEn}</Td>
                <Td className="font-khmer text-muted-foreground">{c.nameKm ?? '—'}</Td>
                <Td className="text-right tabular-nums">{number(c.itemCount)}</Td>
                <Td className="text-right tabular-nums">{money(c.valueCents)}</Td>
                {canWrite ? (
                  <Td className="text-right">
                    <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing(c)}>
                      <Pencil />
                    </Button>
                    <Button size="icon" variant="ghost" aria-label={t('common.delete')} onClick={() => setDeleting(c)}>
                      <Trash2 />
                    </Button>
                  </Td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {editing ? <CategoryDialog category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('categories.deleteTitle')}
        body={t('categories.deleteBody', { name: deleting?.nameEn })}
        confirmLabel={t('common.delete')}
        onConfirm={() => unwrap(window.ci.categories.delete({ id: deleting!.id }))}
      />
    </Page>
  )
}
