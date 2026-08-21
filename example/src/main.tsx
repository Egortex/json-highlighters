import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@chepchik/json-highlighters/styles.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
