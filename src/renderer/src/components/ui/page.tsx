import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-light tracking-tight">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" />
      </div>
      <div>
        <div className="font-medium">{title}</div>
        {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p> : null}
      </div>
      {action}
    </div>
  )
}

/** Consistent data table shell. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border bg-card', className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn('border-b bg-muted/50 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground', className)}>{children}</th>
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn('border-b px-4 py-3 align-middle', className)}>{children}</td>
}
