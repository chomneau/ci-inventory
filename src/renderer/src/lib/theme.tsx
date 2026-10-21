import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { readPreference, writePreference } from './utils'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  isDark: boolean
  setTheme: (t: Theme) => void
}

const STORAGE_KEY = 'ci.theme'
const ThemeContext = createContext<ThemeState | null>(null)
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function initialTheme(): Theme {
  const stored = readPreference(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches)
  const isDark = theme === 'dark' || (theme === 'system' && systemDark)

  useEffect(() => {
    const media = darkQuery()
    const onChange = () => setSystemDark(media.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const setTheme = (t: Theme) => {
    writePreference(STORAGE_KEY, t)
    setThemeState(t)
  }

  return <ThemeContext.Provider value={{ theme, isDark, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
