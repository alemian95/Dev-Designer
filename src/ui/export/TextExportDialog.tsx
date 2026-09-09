import { useState } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { emitDdl } from "@/io/emit/ddl"
import { emitMermaid } from "@/io/emit/mermaid"
import { documentSession } from "@/io/document-session"
import { download } from "@/io/file"
import { documentFileName } from "./file-name"

type Format = "postgres" | "mysql" | "mermaid"

const FORMATS: { value: Format; label: string; extension: string }[] = [
  { value: "postgres", label: "PostgreSQL", extension: "sql" },
  { value: "mysql", label: "MySQL", extension: "sql" },
  { value: "mermaid", label: "Mermaid", extension: "mmd" },
]

/** Vale per tutti i formati: è una proprietà del modello, non del dialetto scelto. */
const MODEL_LIMITS =
  "Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne: un dump che entra ed esce non è identico all'originale."

/**
 * Anteprima e consegna dell'export testo.
 *
 * Il ricalcolo al cambio di formato è una funzione pura su un modello già in memoria: si fa nel
 * render, senza stato asincrono e senza `useEffect`. Se su un diagramma grande si sentisse, si
 * misura e si mette in `useMemo` — non prima.
 */
export function TextExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [format, setFormat] = useState<Format>("postgres")
  const model = useStore(documentStore, (s) => erDiagram(s.doc).model)
  // Gli hook stanno sopra, l'uscita anticipata sotto: `DocumentMenu` si ri-renderizza a ogni
  // battuta sul nome del documento e a ogni cambio del pallino delle modifiche, e senza questa
  // riga i tre emettitori girerebbero ogni volta a dialog chiuso.
  if (!open) return null
  const chosen = FORMATS.find((f) => f.value === format)!
  const { text, warnings } = format === "mermaid" ? emitMermaid(model) : emitDdl(model, format)

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
          <DialogDescription>Il DDL dello schema o il diagramma in Mermaid.</DialogDescription>
        </DialogHeader>
        <ToggleGroup type="single" value={format} onValueChange={(v) => v && setFormat(v as Format)} className="justify-start">
          {FORMATS.map((f) => (
            <ToggleGroupItem key={f.value} value={f.value} aria-label={f.label} className="aria-checked:bg-muted px-3">
              {f.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          <li>{MODEL_LIMITS}</li>
          {warnings.map((w) => (
            <li key={w} data-export-warning className="text-foreground">{w}</li>
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
