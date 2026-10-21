import { useTranslation } from 'react-i18next'

const locale = (lang: string) => (lang === 'km' ? 'km-KH' : 'en-US')

export function useFormat() {
  const { i18n } = useTranslation()
  const loc = locale(i18n.language)
  const money = new Intl.NumberFormat(loc, { style: 'currency', currency: 'USD' })
  const num = new Intl.NumberFormat(loc)
  const dateTime = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeStyle: 'short' })
  return {
    money: (cents: number) => money.format(cents / 100),
    number: (n: number) => num.format(n),
    dateTime: (ms: number) => dateTime.format(new Date(ms)),
    /** Khmer name when the UI is in Khmer and one exists, else English. */
    name: (o: { nameEn: string; nameKm?: string | null }) => (i18n.language === 'km' && o.nameKm ? o.nameKm : o.nameEn)
  }
}

/** "12.50" → 1250. Returns null for anything that is not a non-negative amount with ≤ 2 decimals. */
export function parseMoney(input: string): number | null {
  const s = input.trim()
  if (s === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  return Math.round(Number(s) * 100)
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}
