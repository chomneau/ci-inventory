import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'
import { Input } from './input'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (digits: string) => void
}

/** Single field for a 6-digit authenticator code; strips anything that isn't a digit. */
export const CodeInput = forwardRef<HTMLInputElement, Props>(function CodeInput({ value, onChange, className, ...props }, ref) {
  return (
    <Input
      ref={ref}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      className={cn('h-14 text-center font-mono text-2xl tracking-[0.5em]', className)}
      placeholder="••••••"
      {...props}
    />
  )
})
