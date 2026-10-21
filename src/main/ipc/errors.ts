/** An expected, user-facing failure (bad input, not allowed, not found...). */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly details?: Record<string, string | number>
  ) {
    super(code)
    this.name = 'AppError'
  }
}
