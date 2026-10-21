/**
 * Deterministic JSON: object keys sorted recursively, Dates as ISO strings.
 * Used for hashing, so the same data always produces the same bytes.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}

function normalize(value: unknown): unknown {
  if (value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalize)
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Non-finite number in canonical JSON')
      return value
    case 'object': {
      const obj = value as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(obj)
          .filter((k) => obj[k] !== undefined)
          .sort()
          .map((k) => [k, normalize(obj[k])])
      )
    }
    default:
      throw new TypeError(`Unsupported value in canonical JSON: ${typeof value}`)
  }
}
