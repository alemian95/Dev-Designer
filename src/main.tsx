import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { documentStore } from '@/editor/document-store'
import { autosave, documentIo } from '@/io/app-io'
import { buildStressDocument } from '@/perf/stress'
import App from '@/ui/App'

async function bootstrap(): Promise<void> {
  // `?stress=N` carica un documento sintetico per la misura FPS: non passa dall'archivio e non lo sporca.
  const stress = Number(new URLSearchParams(location.search).get('stress'))
  if (Number.isInteger(stress) && stress > 0) {
    autosave.stop()
    documentStore.getState().load(buildStressDocument(stress))
  } else {
    await documentIo.restoreLast()
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
