import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, LockOpen, Pencil, Smartphone, UserPlus, UserRoundCheck, UserRoundX, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { ManagedUser, TemporaryPassword } from '@shared/admin'
import type { Role } from '@shared/auth'
import { Alert } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Dialog } from '@renderer/components/ui/dialog'
import { Field } from '@renderer/components/ui/field'
import { Input } from '@renderer/components/ui/input'
import { EmptyState, PageHeader, Table, Td, Th } from '@renderer/components/ui/page'
import { Select } from '@renderer/components/ui/select'
import { useCurrentUser } from '@renderer/features/auth/AuthProvider'
import { initials } from '@renderer/features/auth/initials'
import { ConfirmDialog } from '@renderer/features/inventory/parts'
import { useFormat } from '@renderer/lib/format'
import { unwrap, useAction } from '@renderer/lib/ipc'
import { useStepUp } from '@renderer/lib/step-up'
import { useQueryClient } from '@tanstack/react-query'
import { useUsers } from './hooks'
import { TemporaryPasswordDialog } from './TemporaryPasswordDialog'

const ROLES: Role[] = ['admin', 'storekeeper', 'viewer']

function UserDialog({ user, onClose, onCreated }: { user: ManagedUser | null; onClose: () => void; onCreated: (t: TemporaryPassword) => void }) {
  const { t } = useTranslation()
  const withStepUp = useStepUp()
  const qc = useQueryClient()
  const { run, pending, error } = useAction({ DUPLICATE: t('users.duplicate') })
  const [email, setEmail] = useState(user?.email ?? '')
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'storekeeper')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const result = await run(() =>
      withStepUp(async () => {
        if (user) {
          await unwrap(window.ci.users.update({ id: user.id, displayName, role }))
          return null
        }
        return unwrap(window.ci.users.create({ email, displayName, role }))
      })
    )
    if (result === undefined) return
    await qc.invalidateQueries({ queryKey: ['users'] })
    onClose()
    if (result) onCreated(result)
    else toast.success(t('common.saved'))
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={user ? t('users.edit') : t('users.new')}
      description={user ? user.email : t('users.newHint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="user-form" disabled={pending || !displayName.trim() || (!user && !email.trim())}>
            {user ? t('common.save') : t('users.create')}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        {!user ? (
          <Field label={t('auth.email')} htmlFor="u-email">
            <Input id="u-email" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        ) : null}
        <Field label={t('auth.fullName')} htmlFor="u-name">
          <Input id="u-name" required maxLength={100} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t('users.role')} htmlFor="u-role" hint={t(`users.roleHints.${role}`)}>
          <Select id="u-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Dialog>
  )
}

type Pending = { kind: 'disable' | 'enable' | 'resetPassword' | 'resetAuthenticator'; user: ManagedUser }

export function UsersPage() {
  const { t } = useTranslation()
  const { dateTime } = useFormat()
  const me = useCurrentUser()
  const withStepUp = useStepUp()
  const qc = useQueryClient()
  const { data: users, isLoading } = useUsers()
  const [editing, setEditing] = useState<ManagedUser | null | 'new'>(null)
  const [temp, setTemp] = useState<TemporaryPassword | null>(null)
  const [confirm, setConfirm] = useState<Pending | null>(null)

  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] })
  const act = async (p: Pending) => {
    const { id } = p.user
    switch (p.kind) {
      case 'disable':
      case 'enable':
        await withStepUp(() => unwrap(window.ci.users.setDisabled({ id, disabled: p.kind === 'disable' })))
        toast.success(p.kind === 'disable' ? t('users.disabled') : t('users.enabled'))
        break
      case 'resetPassword':
        setTemp(await withStepUp(() => unwrap(window.ci.users.resetPassword({ id }))))
        break
      case 'resetAuthenticator':
        await withStepUp(() => unwrap(window.ci.users.resetAuthenticator({ id })))
        toast.success(t('users.authenticatorReset'))
        break
    }
    await refresh()
  }
  const unlock = (u: ManagedUser) =>
    withStepUp(() => unwrap(window.ci.users.unlock({ id: u.id })))
      .then(() => (toast.success(t('users.unlocked')), refresh()))
      .catch(() => undefined)

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <PageHeader
        title={t('nav.users')}
        description={t('users.subtitle')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <UserPlus />
            {t('users.new')}
          </Button>
        }
      />
      {!isLoading && users?.length === 0 ? (
        <EmptyState icon={Users} title={t('users.empty')} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t('users.user')}</Th>
              <Th>{t('users.role')}</Th>
              <Th>{t('users.status')}</Th>
              <Th>{t('users.lastSignIn')}</Th>
              <Th className="w-56" />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const self = u.id === me.id
              return (
                <tr key={u.id} className={u.disabled ? 'opacity-60' : undefined}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        {initials(u.displayName)}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">
                          {u.displayName} {self ? <span className="text-xs font-normal text-muted-foreground">({t('users.you')})</span> : null}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={u.role === 'admin' ? 'blue' : 'neutral'}>{t(`roles.${u.role}`)}</Badge>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.disabled ? <Badge tone="red">{t('users.statusDisabled')}</Badge> : null}
                      {u.locked ? <Badge tone="amber">{t('users.statusLocked')}</Badge> : null}
                      {!u.authenticatorLinked ? <Badge tone="amber">{t('users.statusNoPhone')}</Badge> : null}
                      {u.mustChangePassword ? <Badge>{t('users.statusTempPassword')}</Badge> : null}
                      {!u.disabled && !u.locked && u.authenticatorLinked && !u.mustChangePassword ? (
                        <Badge tone="green">{t('users.statusActive')}</Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{u.lastLoginAt ? dateTime(u.lastLoginAt) : t('users.never')}</Td>
                  <Td className="text-right">
                    <Button size="icon" variant="ghost" title={t('common.edit')} aria-label={t('common.edit')} onClick={() => setEditing(u)}>
                      <Pencil />
                    </Button>
                    {u.locked ? (
                      <Button size="icon" variant="ghost" title={t('users.unlock')} aria-label={t('users.unlock')} onClick={() => void unlock(u)}>
                        <LockOpen />
                      </Button>
                    ) : null}
                    {!self ? (
                      <>
                        <Button size="icon" variant="ghost" title={t('users.resetPassword')} aria-label={t('users.resetPassword')} onClick={() => setConfirm({ kind: 'resetPassword', user: u })}>
                          <KeyRound />
                        </Button>
                        {u.authenticatorLinked ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            title={t('users.resetAuthenticator')}
                            aria-label={t('users.resetAuthenticator')}
                            onClick={() => setConfirm({ kind: 'resetAuthenticator', user: u })}
                          >
                            <Smartphone />
                          </Button>
                        ) : null}
                        <Button
                          size="icon"
                          variant="ghost"
                          title={u.disabled ? t('users.enable') : t('users.disable')}
                          aria-label={u.disabled ? t('users.enable') : t('users.disable')}
                          onClick={() => setConfirm({ kind: u.disabled ? 'enable' : 'disable', user: u })}
                        >
                          {u.disabled ? <UserRoundCheck /> : <UserRoundX />}
                        </Button>
                      </>
                    ) : null}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {editing ? <UserDialog user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onCreated={setTemp} /> : null}
      {temp ? <TemporaryPasswordDialog value={temp} onClose={() => setTemp(null)} /> : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? t(`users.confirm.${confirm.kind}.title`) : ''}
        body={confirm ? t(`users.confirm.${confirm.kind}.body`, { name: confirm.user.displayName }) : ''}
        confirmLabel={confirm ? t(`users.confirm.${confirm.kind}.action`) : ''}
        onConfirm={() => act(confirm!)}
      />
    </div>
  )
}
