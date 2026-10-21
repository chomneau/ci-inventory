import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={3}
      className={cn(
        'w-full rounded-lg border bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground/70',
        'focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/25',
        className
      )}
      {...props}
    />
  )
})
