import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { autosave } from "@/io/app-io"

/**
 * Ultima rete sotto l'albero di render. Senza, un errore in un componente smonta tutto e lascia la
 * pagina bianca: il documento resta solo in memoria e l'utente non ha nemmeno un posto dove leggere
 * cosa è successo.
 *
 * `componentDidCatch` forza l'autosave prima di mostrare il guasto, così il ricarico riparte
 * dall'ultima modifica e non dall'ultimo debounce scaduto. Il flush non è atteso — qui non c'è nulla
 * da fare col suo esito, e l'archivio può essere indisponibile — quindi il testo promette solo ciò
 * che `restoreLast` garantisce comunque: l'ultimo stato che l'archivio contiene.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null }

  static getDerivedStateFromError(e: unknown): { message: string } {
    return { message: e instanceof Error ? e.message : String(e) }
  }

  componentDidCatch(e: Error, info: ErrorInfo): void {
    // Non si nasconde: la console resta la sede dello stack, il pannello dice solo il messaggio.
    console.error(e, info.componentStack)
    void autosave.flush()
  }

  render(): ReactNode {
    const { message } = this.state
    if (message === null) return this.props.children
    return (
      <div role="alert" className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="max-w-prose text-sm">Qualcosa è andato storto nell'interfaccia. Ricaricando la pagina si riparte dall'ultimo stato presente nell'archivio.</p>
        <p className="max-w-prose font-mono text-xs break-words text-muted-foreground">{message}</p>
        <Button onClick={() => location.reload()}>Ricarica</Button>
      </div>
    )
  }
}
