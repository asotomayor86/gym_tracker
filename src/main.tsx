import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import UpdateBanner from './components/UpdateBanner'
import { ensureSeed } from './lib/ensureSeed'
import { awaitsFirstSync, hasToken, startAutoSync } from './lib/sync'
import { startUpdates } from './lib/swUpdate'

if (!awaitsFirstSync()) void ensureSeed({ merge: !hasToken() })
startAutoSync()
startUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <UpdateBanner />
    </BrowserRouter>
  </StrictMode>,
)
