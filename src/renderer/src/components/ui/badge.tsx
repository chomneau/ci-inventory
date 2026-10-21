import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

const tones = {
  neutral: 'bg-muted text-muted-foreground',
  blue: 'bg-ci-blue/12 text-ci-blue-deep dark:text-ci-blue',
  green: 'bg-ci-green/15 text-[#2f7a2a] dark:text-ci-green',
  red: 'bg-red-500/12 text-red-700 dark:text-red-300',
  amber: 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
} as const

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>
}
