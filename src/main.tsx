import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ensureSeed } from './lib/ensureSeed'
import { awaitsFirstSync, hasToken, startAutoSync } from './lib/sync'

registerSW({ immediate: true })
if (!awaitsFirstSync()) void ensureSeed({ merge: !hasToken() })
startAutoSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
