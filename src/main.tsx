import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { documentStore } from '@/editor/document-store'
import { autosave, documentIo } from '@/io/app-io'
import { documentSession } from '@/io/document-session'
import { buildStressDocument } from '@/perf/stress'
import App from '@/ui/App'
import { ErrorBoundary } from '@/ui/ErrorBoundary'

async function bootstrap(): Promise<void> {
  // `?stress=N` carica un documento sintetico per la misura FPS: non passa dall'archivio e non lo sporca.
  const stress = Number(new URLSearchParams(location.search).get('stress'))
  if (Number.isInteger(stress) && stress > 0) {
    autosave.stop()
    documentStore.getState().load(buildStressDocument(stress))
  } else {
    // L'app deve partire anche se il ripristino fallisce: un errore qui lascerebbe la pagina bianca.
    try {
      await documentIo.restoreLast()
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      documentSession.getState().patch({ notice: `Non è stato possibile riaprire l'ultimo documento (${reason}): si parte da uno nuovo.` })
    }
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}

// Un rigetto non gestito non passa da un render, quindi l'`ErrorBoundary` non lo vede: senza questo
// resterebbe solo in console e l'utente vedrebbe un'azione che non succede e basta. Non si chiama
// `preventDefault`: l'avviso si aggiunge alla console, non la sostituisce.
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
  documentSession.getState().patch({ notice: `Operazione non riuscita: ${reason}` })
})

void bootstrap()
