import { useState } from "react"
import { useStore } from "zustand"
import { useShallow } from "zustand/react/shallow"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { classDiagram } from "@/editor/class-access"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { flowDiagram } from "@/editor/flow-access"
import { splitKey } from "@/editor/families"
import { familyHasContent } from "@/editor/kinds/canvas-ops"
import { noteDiagram } from "@/editor/note-access"
import { emitDdl } from "@/io/emit/ddl"
import type { Dialect } from "@/io/ddl/schema"
import { emitClassMermaid } from "@/io/emit/class-mermaid"
import { emitMermaid } from "@/io/emit/er-mermaid"
import { emitFlowMermaid } from "@/io/emit/flow-mermaid"
import type { EmitResult } from "@/io/emit/result"
import { documentSession } from "@/io/document-session"
import { download } from "@/io/file"
import type { ClassModel } from "@/model/class/schema"
import type { ErModel } from "@/model/er/schema"
import type { Family } from "@/model/family"
import type { FlowModel } from "@/model/flow/schema"
import type { Note } from "@/model/note/schema"
import { documentFileName } from "./file-name"

type Format = Dialect | "mermaid" | "class-mermaid" | "flow-mermaid"

/**
 * Le famiglie che hanno un formato di testo: le note escono dentro quello delle classi, o in nessuno
 * (spec 3a §8); le forme in nessuno (spec 3b §8).
 */
type ExportFamily = Exclude<Family, "note" | "shape">

/** La famiglia di ogni formato: un formato si offre solo se la sua famiglia ha contenuto. */
const FORMAT_FAMILY: Record<Format, ExportFamily> = {
  postgres: "er",
  mysql: "er",
  mermaid: "er",
  "class-mermaid": "class",
  "flow-mermaid": "flow",
}

/** I modelli delle famiglie, letti dal selettore: riferimenti stabili, confrontati da `useShallow`. */
interface Models {
  er: ErModel | null
  class: ClassModel | null
  flow: FlowModel | null
  notes: Readonly<Record<string, Note>>
}

function emit(models: Models, format: Format): EmitResult {
  const empty = { text: "", warnings: [] }
  switch (format) {
    case "postgres":
    case "mysql":
      return models.er ? emitDdl(models.er, format) : empty
    case "mermaid":
      return models.er ? emitMermaid(models.er, models.notes) : empty
    case "class-mermaid":
      return models.class ? emitClassMermaid(models.class, models.notes) : empty
    case "flow-mermaid":
      return models.flow ? emitFlowMermaid(models.flow, models.notes) : empty
  }
}

/**
 * Un Record e non una lista: così `FORMATS[format]` è totale e `tsc` verifica che ogni formato
 * dell'union abbia la sua voce, invece di affidarsi a una non-null assertion su `.find()`.
 * L'ordine delle chiavi stringa è quello di scrittura, ed è l'ordine dei pulsanti di default e
 * l'ordine di `FORMAT_FAMILY`, cioè l'ordine di `FAMILIES`. Le tre etichette «Mermaid» hanno il
 * nome della famiglia: con le famiglie mescolate, tre «Mermaid» non sarebbero distinguibili.
 */
const FORMATS: Record<Format, { label: string; extension: string }> = {
  postgres: { label: "PostgreSQL", extension: "sql" },
  mysql: { label: "MySQL", extension: "sql" },
  mermaid: { label: "Mermaid ER", extension: "mmd" },
  "class-mermaid": { label: "Mermaid classi", extension: "mmd" },
  "flow-mermaid": { label: "Mermaid flowchart", extension: "mmd" },
}

/**
 * Vale per tutti i formati di una data famiglia: è una proprietà del modello, non del dialetto
 * scelto. Testo diverso per famiglia — quello ER parla del round trip col dump SQL, quello class
 * elenca gli elementi UML che §16 della spec mette fuori scopo (non se ne inventano altri).
 */
const MODEL_LIMITS: Record<ExportFamily, string> = {
  er: "Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più colonne: un dump che entra ed esce non è identico all'originale.",
  class: "Il modello non rappresenta generici, package, classi di associazione, classi annidate e visibilità di pacchetto.",
  flow: "Le note non hanno equivalente in Mermaid, e le corsie diventano riquadri (subgraph) invece di bande orizzontali vere.",
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
  // I modelli sono costruiti dal selettore, non derivati da `s.doc`: gli emettitori leggono il
  // solo modello, e un commit di drag cambia `view.nodes` lasciando il modello com'era — con
  // `s.doc` il dialogo aperto ri-emetterebbe tutto il DDL a ogni spostamento. Il selettore
  // costruisce un oggetto nuovo ad ogni chiamata, e `useStore` (`useSyncExternalStore` sotto)
  // confronta gli snapshot per riferimento: senza `useShallow` sarebbe uno snapshot instabile.
  const models = useStore(
    documentStore,
    useShallow((s): Models => {
      const has = (f: Family) => familyHasContent(s.doc, f)
      return {
        er: has("er") ? erDiagram(s.doc).model : null,
        class: has("class") ? classDiagram(s.doc).model : null,
        flow: has("flow") ? flowDiagram(s.doc).model : null,
        notes: noteDiagram(s.doc).model.notes,
      }
    }),
  )
  // DDL e Mermaid non hanno una notazione fra tipi di diagramma diversi (spec 4a §8): lo si dice.
  const hasLinks = useStore(documentStore, (s) => Object.keys(s.doc.diagram.links).length > 0)
  // Le forme non hanno formato di testo (spec 3b §8): lo si dice, con i formati e senza.
  const hasShapes = useStore(documentStore, (s) => familyHasContent(s.doc, "shape"))
  // Una nota ancorata a una forma non ha formato di testo neanche lei: `class-mermaid.ts` la salta
  // come le altre note ancorate fuori dalla famiglia classe (righe apposite lì). Non è libera — dirlo
  // come se lo fosse («chiede almeno una classe») è falso: una classe non la farebbe mai comparire.
  const shapeAnchoredNotes = Object.values(models.notes).some((n) => n.anchor !== null && splitKey(n.anchor).family === "shape")
  const freeNoteCount = Object.values(models.notes).filter((n) => n.anchor === null).length
  // Gli hook stanno sopra, l'uscita anticipata sotto: `DocumentMenu` si ri-renderizza a ogni
  // battuta sul nome del documento e a ogni cambio del pallino delle modifiche, e senza questa
  // riga gli emettitori girerebbero ogni volta a dialog chiuso.
  if (!open) return null
  const formats = (Object.keys(FORMAT_FAMILY) as Format[]).filter((f) => models[FORMAT_FAMILY[f]] !== null)
  // `format` (lo stato) può restare su un formato di una famiglia senza più contenuto — es. si apre
  // il dialog su un ER, si svuota o si cambia documento: `formats` cambia ma lo stato no. Una
  // funzione pura sul render, non un `useEffect` che lo risincronizza.
  const effectiveFormat = formats.includes(format) ? format : (formats[0] ?? format)
  const chosen = FORMATS[effectiveFormat]
  const { text, warnings } = formats.length > 0 ? emit(models, effectiveFormat) : { text: "", warnings: [] }

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
          <DialogDescription>Il DDL dello schema o i diagrammi in Mermaid, una famiglia per formato.</DialogDescription>
        </DialogHeader>
        {/* Con un solo formato offerto non c'è nulla da scegliere: il gruppo non si mostra. */}
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
        {formats.length > 0 ? (
          <>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              <li>{MODEL_LIMITS[FORMAT_FAMILY[effectiveFormat]]}</li>
              {hasLinks && <li data-export-links-note>I collegamenti fra famiglie non hanno una notazione in questo formato.</li>}
              {hasShapes && (
                <li data-export-shapes-note>
                  {shapeAnchoredNotes
                    ? "Le forme, e le note ancorate a una forma, escono solo come immagine (SVG o PNG)."
                    : "Le forme escono solo come immagine (SVG o PNG)."}
                </li>
              )}
              {/* La chiave è l'indice: gli avvisi sono una lista derivata e stabile, e due avvisi
                  con lo stesso testo darebbero chiavi duplicate. */}
              {warnings.map((w, i) => (
                <li key={i} data-export-warning className="text-foreground">{w}</li>
              ))}
            </ul>
            <pre data-export-preview className="max-h-96 overflow-auto rounded border bg-muted/40 p-3 font-mono text-xs">{text}</pre>
          </>
        ) : hasShapes || freeNoteCount > 0 ? (
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {hasShapes && (
              <p>
                {shapeAnchoredNotes
                  ? "Le forme, e le note ancorate a una forma, escono solo come immagine: usa l'export SVG o PNG."
                  : "Le forme escono solo come immagine: usa l'export SVG o PNG."}
              </p>
            )}
            {freeNoteCount > 0 && (
              <p>Le note libere escono solo nel Mermaid delle classi, che chiede almeno una classe: qui non ce n'è nessuna.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Il documento è vuoto: non c'è niente da esportare.</p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={formats.length === 0} onClick={() => void copy()}>Copia</Button>
          <Button disabled={formats.length === 0} onClick={() => download(documentFileName(chosen.extension), text, "text/plain;charset=utf-8")}>
            Scarica
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
