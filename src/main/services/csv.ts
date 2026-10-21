type Cell = string | number | boolean | null | undefined

/**
 * RFC 4180 CSV. Text cells that a spreadsheet would treat as a formula
 * (= + - @ tab CR) are prefixed with an apostrophe to block CSV injection.
 * Numbers stay numeric, so negative quantities are unaffected.
 */
export function toCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

function cell(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${text.replace(/"/g, '""')}"`
}
