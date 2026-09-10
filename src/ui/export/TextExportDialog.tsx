import { useState } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { classDiagram } from "@/editor/class-access"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { emitDdl } from "@/io/emit/ddl"
import type { Dialect } from "@/io/ddl/schema"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import { emitMermaid } from "@/io/emit/er-mermaid"
import type { EmitResult } from "@/io/emit/result"
import { documentSession } from "@/io/document-session"
import { download } from "@/io/file"
import type { ClassModel } from "@/model/class/schema"
import type { ErModel } from "@/model/er/schema"
import { useDiagramView, type TextFormat } from "@/ui/canvas/kinds/registry"
import { documentFileName } from "./file-name"

type Format = Dialect | "mermaid" | "class-mermaid"

/** Il modello del documento aperto, marcato col tipo di diagramma: due `Record` diversi
 *  (`ErModel`/`ClassModel`) non si distinguono da soli, e `emit` sotto ne ha bisogno per scegliere
 *  l'emettitore senza un cast. */
type ModelState = { kind: "er"; model: ErModel } | { kind: "class"; model: ClassModel } | null

/**
 * Sceglie l'emettitore in base al tipo di modello e, per l'ER, al formato scelto. Il ramo finale
 * (`class-mermaid` su un modello ER) non può accadere — `erView.textFormats` non lo elenca mai fra
 * le opzioni — ma resta per rendere la funzione totale senza un cast su `format`.
 */
function emit(state: ModelState, format: Format): EmitResult {
  if (!state) return { text: "", warnings: [] }
  if (state.kind === "class") return emitClassMermaid(state.model)
  if (format === "mermaid") return emitMermaid(state.model)
  if (format === "postgres" || format === "mysql") return emitDdl(state.model, format)
  return { text: "", warnings: [] }
}

/**
 * Un Record e non una lista: così `FORMATS[format]` è totale e `tsc` verifica che ogni formato
 * dell'union abbia la sua voce, invece di affidarsi a una non-null assertion su `.find()`.
 * L'ordine delle chiavi stringa è quello di scrittura, ed è l'ordine dei pulsanti di default:
 * quello vero, per diagramma, è `view.textFormats` — questa tabella resta ferma anche quando
 * un tipo usa un sottoinsieme diverso.
 */
const FORMATS: Record<Format, { label: string; extension: string }> = {
  postgres: { label: "PostgreSQL", extension: "sql" },
  mysql: { label: "MySQL", extension: "sql" },
  mermaid: { label: "Mermaid", extension: "mmd" },
  "class-mermaid": { label: "Mermaid", extension: "mmd" },
}

/** `view.textFormats` è tipato su tutta la union: qui si mostra solo chi ha un emettitore. */
function hasEmitter(format: TextFormat): format is Format {
  return format in FORMATS
}

/**
 * Vale per tutti i formati di un dato tipo: è una proprietà del modello, non del dialetto scelto.
 * Testo diverso per tipo di diagramma — quello ER parla del round trip col dump SQL, quello class
 * elenca gli elementi UML che §16 della spec mette fuori scopo (non se ne inventano altri).
 */
const MODEL_LIMITS: Record<"er" | "class", string> = {
  er: "Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne: un dump che entra ed esce non è identico all'originale.",
  class: "Il modello non rappresenta generici, package, note, classi di associazione, classi annidate e visibilità di pacchetto.",
}

/** Stessa idea di `MODEL_LIMITS`, per la descrizione del dialogo: menziona il DDL solo quando è
 *  davvero fra i formati offerti (`erView.textFormats`), non su ogni tipo di diagramma. */
const DIALOG_DESCRIPTION: Record<"er" | "class", string> = {
  er: "Il DDL dello schema o il diagramma in Mermaid.",
  class: "Il diagramma in Mermaid.",
}

/**
 * Anteprima e consegna dell'export testo.
 *
 * Il ricalcolo al cambio di formato è una funzione pura su un modello già in memoria: si fa nel
 * render, senza stato asincrono e senza `useEffect`. Se su un diagramma grande si sentisse, si
 * misura e si mette in `useMemo` — non prima.
 */
export function TextExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [format, setFormat] = useState<Format>("postgres")
  // Il `ModelState` è costruito dal selettore, non derivato da `s.doc`: gli emettitori leggono il
  // solo modello, e un commit di drag cambia `view.nodes` lasciando il modello com'era — con
  // `s.doc` il dialogo aperto ri-emetterebbe tutto il DDL a ogni spostamento. Il selettore
  // costruisce un oggetto nuovo ad ogni chiamata, e `useStore` (`useSyncExternalStore` sotto)
  // confronta gli snapshot per riferimento: senza `useShallow` sarebbe uno snapshot instabile.
  const modelState = useStore(
    documentStore,
    useShallow((s): ModelState =>
      s.doc.diagram.type === "er" ? { kind: "er", model: erDiagram(s.doc).model } :
      s.doc.diagram.type === "class" ? { kind: "class", model: classDiagram(s.doc).model } :
      null),
  )
  const view = useDiagramView()
  // Gli hook stanno sopra, l'uscita anticipata sotto: `DocumentMenu` si ri-renderizza a ogni
  // battuta sul nome del documento e a ogni cambio del pallino delle modifiche, e senza questa
  // riga gli emettitori girerebbero ogni volta a dialog chiuso.
  if (!open) return null
  const formats = view.textFormats.filter(hasEmitter)
  // `format` (lo stato) può restare su un formato dell'altro tipo di diagramma — es. si apre il
  // dialog su un ER, si cambia documento, si riapre su un class diagram: `formats` cambia ma lo
  // stato no. Una funzione pura sul render, non un `useEffect` che lo risincronizza.
  const effectiveFormat = formats.includes(format) ? format : (formats[0] ?? format)
  const chosen = FORMATS[effectiveFormat]
  const { text, warnings } = emit(modelState, effectiveFormat)

  const copy = async () => {
    const patch = documentSession.getState().patch
    try {
      await navigator.clipboard.writeText(text)
      patch({ notice: "Testo copiato negli appunti." })
    } catch {
      // Contesto non sicuro o permesso negato: l'utente può sempre selezionare l'anteprima.
      patch({ notice: "Non è stato possibile copiare negli appunti." })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-text-export-dialog className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Esporta testo</DialogTitle>
          <DialogDescription>{modelState ? DIALOG_DESCRIPTION[modelState.kind] : ""}</DialogDescription>
        </DialogHeader>
        {/* Con un solo formato (i class diagram hanno solo `class-mermaid`) non c'è nulla da
            scegliere: il gruppo non si mostra. */}
        {formats.length > 1 && (
          <ToggleGroup type="single" value={effectiveFormat} onValueChange={(v) => v && setFormat(v as Format)} className="justify-start">
            {formats.map((value) => (
              // Nessun aria-label: sovrascriverebbe il nome accessibile che il testo visibile dà da sé.
              <ToggleGroupItem key={value} value={value} className="aria-checked:bg-muted px-3">
                {FORMATS[value].label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {modelState && <li>{MODEL_LIMITS[modelState.kind]}</li>}
          {/* La chiave è l'indice: gli avvisi sono una lista derivata e stabile, e due avvisi
              con lo stesso testo darebbero chiavi duplicate. */}
          {warnings.map((w, i) => (
            <li key={i} data-export-warning className="text-foreground">{w}</li>
          ))}
        </ul>
        <pre data-export-preview className="max-h-96 overflow-auto rounded border bg-muted/40 p-3 font-mono text-xs">{text}</pre>
        <DialogFooter>
          <Button variant="outline" onClick={() => void copy()}>Copia</Button>
          <Button onClick={() => download(documentFileName(chosen.extension), text, "text/plain;charset=utf-8")}>Scarica</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
