import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { documentStore } from '@/editor/document-store'
import { buildStressDocument } from '@/perf/stress'
import App from '@/ui/App'

// `?stress=N` carica un documento sintetico: serve alla misura FPS (Task 11) e alla prova manuale.
const stress = Number(new URLSearchParams(location.search).get('stress'))
if (Number.isInteger(stress) && stress > 0) documentStore.getState().load(buildStressDocument(stress))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
