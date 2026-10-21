import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/noto-sans-khmer/400.css'
import '@fontsource/noto-sans-khmer/600.css'
import './styles.css'
import './i18n'
import { ThemeProvider } from './lib/theme'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
)
