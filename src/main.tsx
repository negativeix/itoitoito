import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
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

// Game rules live on the server, so an outdated tab must not keep running old client code:
// check for a new deploy every minute (and when the tab comes back) and reload into it.
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => {})
    }
    setInterval(check, 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
