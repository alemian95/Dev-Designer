import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { documentIo } from "@/io/app-io"
import { documentSession } from "@/io/document-session"

/** Sotto la toolbar: la sola lettura (con "prendi il controllo") e gli avvisi da chiudere. Nulla se non c'è niente da dire. */
export function NoticeBar() {
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const notice = useStore(documentSession, (s) => s.notice)
  const patch = useStore(documentSession, (s) => s.patch)
  if (!readOnly && !notice) return null
  return (
    <div role="status" data-notice-bar className="flex flex-col gap-1 border-b bg-muted/60 px-3 py-1.5 text-sm">
      {readOnly && (
        <div className="flex items-center gap-3">
          <span>Questo documento è aperto in un'altra scheda: qui è in sola lettura.</span>
          <Button size="sm" variant="outline" data-take-control onClick={() => void documentIo.takeControl()}>Prendi il controllo</Button>
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-3">
          <span>{notice}</span>
          <Button size="sm" variant="ghost" aria-label="Chiudi avviso" onClick={() => patch({ notice: null })}>×</Button>
        </div>
      )}
    </div>
  )
}
