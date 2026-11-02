import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { applyThemePref, getThemePref } from './lib/theme'
import '@fontsource/anuphan/thai-400.css'
import '@fontsource/anuphan/thai-500.css'
import '@fontsource/anuphan/thai-700.css'
import '@fontsource/anuphan/latin-400.css'
import '@fontsource/anuphan/latin-500.css'
import '@fontsource/anuphan/latin-700.css'
import '@fontsource-variable/fraunces/opsz.css'
import './styles/index.css'

applyThemePref(getThemePref())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
