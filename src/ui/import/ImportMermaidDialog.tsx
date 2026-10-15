import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { classDiagram } from "@/editor/class-access"
import {
  classImportFates, erImportFates, importMermaidClass, importMermaidEr, placeClassImport, placeErImport, selectClassFragment,
  selectErFragment, type ImportFate,
} from "@/editor/commands/import-mermaid"
import { documentStore, type Recipe } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { noteDiagram } from "@/editor/note-access"
import { layoutEngine } from "@/io/app-io"
import { documentSession } from "@/io/document-session"
import { analyseMermaid, type MermaidAnalysis } from "@/io/mermaid/analyse"
import { blocks, detect, lineOf, type MermaidBlock } from "@/io/mermaid/common"
import type { DevDocument } from "@/model/document"
import type { LayoutGraph } from "@/model/layout"

type Stage =
  | { kind: "vuoto" }
  | { kind: "analizzato"; block: MermaidBlock; result: MermaidAnalysis }
  | { kind: "importa" }
  | { kind: "fatto"; family: Family; elements: number; relations: number; notes: number; warnings: string[] }

type Ready = Extract<MermaidAnalysis, { ok: true }>
type Family = Ready["kind"]

const NOUN: Record<Family, string> = { er: "entità", class: "classi" }

const FATE_LABEL: Record<ImportFate, string> = { nuovo: "nuova", sostituisce: "già presente, verrà sostituita", identico: "identica, saltata" }

/** Il nome della famiglia di un blocco, per il selettore dei blocchi di un `.md`. */
function blockLabel(block: MermaidBlock, index: number): string {
  const kind = detect(block.text)
  const name = kind === null ? "vuoto" : typeof kind === "object" ? kind.unknown : { er: "ER", class: "classi", flow: "flowchart" }[kind]
  return `Blocco ${index + 1} · ${name}`
}

function importFates(doc: DevDocument, ready: Ready): Record<string, ImportFate> {
  return ready.kind === "er" ? erImportFates(doc, ready.fragment.entities) : classImportFates(doc, ready.fragment.classes)
}

/** Relazioni e note presenti nella famiglia: la differenza prima/dopo il dispatch dice quante ne sono entrate davvero. */
function counts(doc: DevDocument, family: Family): { relations: number; notes: number } {
  if (family === "er") return { relations: Object.keys(erDiagram(doc).model.relationships).length, notes: 0 }
  return { relations: Object.keys(classDiagram(doc).model.relations).length, notes: Object.keys(noteDiagram(doc).model.notes).length }
}

/** Selezione, disposizione e comando della famiglia: ciò che resta da fare è il dispatch. */
async function prepareImport(
  ready: Ready, doc: DevDocument, chosen: ReadonlySet<string>,
): Promise<{ recipe: Recipe; elements: number; fallback: string | null }> {
  const layout = (g: LayoutGraph) => layoutEngine.layout(g)
  if (ready.kind === "er") {
    const present = new Set(Object.keys(erDiagram(doc).model.entities))
    const { entities, relationships } = selectErFragment(ready.fragment.entities, ready.fragment.relationships, chosen, present)
    const { positions, fallback } = await placeErImport(doc, entities, relationships, layout)
    return { recipe: importMermaidEr(entities, relationships, positions), elements: Object.keys(entities).length, fallback }
  }
  const present = new Set(Object.keys(classDiagram(doc).model.classes))
  const fragment = selectClassFragment(ready.fragment.classes, ready.fragment.relations, ready.fragment.notes, chosen, present)
  const placement = await placeClassImport(doc, fragment, layout)
  return { recipe: importMermaidClass(fragment, placement), elements: Object.keys(fragment.classes).length, fallback: placement.fallback }
}

/** I conteggi del riepilogo, prima dell'import. */
function summary(ready: Ready): string {
  if (ready.kind === "er") return `${Object.keys(ready.fragment.entities).length} entità, ${ready.fragment.relationships.length} relazioni`
  const { classes, relations, notes } = ready.fragment
  return `${Object.keys(classes).length} classi, ${relations.length} relazioni, ${notes.length} note`
}

/**
 * Import Mermaid (spec §7): gemello di `ImportDdlDialog`. L'analisi è sincrona (spec §3.2), quindi non
 * c'è uno stato «analisi»; lo è anche la disposizione degli elementi nuovi, che passa per il worker di
 * ELK, e per quella la generazione protegge come nel DDL da una risposta arrivata dopo la chiusura.
 */
export function ImportMermaidDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState("")
  const [blockIndex, setBlockIndex] = useState(0)
  const [stage, setStage] = useState<Stage>({ kind: "vuoto" })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const generation = useRef(0)

  const doc = useStore(documentStore, (s) => s.doc)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const found = blocks(text)

  const analyse = (source: string, index: number) => {
    const all = blocks(source)
    const block = all[Math.min(index, all.length - 1)]!
    const result = analyseMermaid(block.text)
    if (result.ok) {
      const fates = importFates(documentStore.getState().doc, result)
      setChosen(new Set(Object.keys(fates).filter((key) => fates[key] !== "identico")))
    }
    setStage({ kind: "analizzato", block, result })
  }

  /** Il testo incollato o caricato si analizza da sé, a partire dal primo blocco; quello digitato col pulsante. */
  const receive = (source: string) => {
    setText(source)
    setBlockIndex(0)
    analyse(source, 0)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData("text")
    if (!pasted) return
    e.preventDefault()
    receive(pasted)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) receive(await file.text())
  }

  const onImport = async () => {
    // Stessa guardia del DDL: la sola lettura può sopravvenire fra il render e il click.
    if (stage.kind !== "analizzato" || !stage.result.ok || documentSession.getState().readOnly) return
    const gen = ++generation.current
    const ready = stage.result
    setStage({ kind: "importa" })
    const { recipe, elements, fallback } = await prepareImport(ready, documentStore.getState().doc, chosen)
    if (generation.current !== gen || documentSession.getState().readOnly) return
    const before = counts(documentStore.getState().doc, ready.kind)
    documentStore.getState().dispatch(recipe)
    const after = counts(documentStore.getState().doc, ready.kind)
    setStage({
      kind: "fatto",
      family: ready.kind,
      elements,
      relations: after.relations - before.relations,
      notes: after.notes - before.notes,
      warnings: [...ready.fragment.warnings.map((w) => w.message), ...(fallback ? [fallback] : [])],
    })
  }

  const close = (next: boolean) => {
    if (!next) {
      generation.current++
      setText("")
      setBlockIndex(0)
      setStage({ kind: "vuoto" })
      setChosen(new Set())
    }
    onOpenChange(next)
  }

  const toggle = (key: string) => {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const ready = stage.kind === "analizzato" && stage.result.ok ? stage.result : null
  const fates = ready ? importFates(doc, ready) : {}
  /** La riga nel testo intero, non nel blocco: è quella che l'utente vede nel textarea. */
  const lineInText = (block: MermaidBlock, at: number) => lineOf(text, block.offset + at)

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" data-import-mermaid-dialog>
        <DialogHeader>
          <DialogTitle>Importa Mermaid</DialogTitle>
          <DialogDescription>
            Incolla o carica un erDiagram o un classDiagram, anche dentro un file Markdown: gli elementi scelti entrano nel
            diagramma aperto, in un solo passo annullabile.
          </DialogDescription>
        </DialogHeader>

        {stage.kind === "fatto" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto text-sm">
            <p>
              Importate <strong>{stage.elements}</strong> {NOUN[stage.family]} e <strong>{stage.relations}</strong> relazioni
              {stage.family === "class" && <>, con <strong>{stage.notes}</strong> note</>}.
            </p>
            {stage.warnings.length > 0 && (
              <details open data-import-warnings>
                <summary className="cursor-pointer text-muted-foreground">{stage.warnings.length} avvisi</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {stage.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto">
            <textarea
              aria-label="Mermaid"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              placeholder="erDiagram o classDiagram …"
              className="h-32 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center gap-2">
              <input type="file" accept=".mmd,.mermaid,.md,.txt" aria-label="Carica un file Mermaid" onChange={(e) => void onFile(e)} className="text-xs" />
              <Button variant="secondary" size="sm" className="ml-auto" disabled={!text.trim() || stage.kind === "importa"} onClick={() => analyse(text, blockIndex)}>
                Analizza
              </Button>
            </div>

            {found.length > 1 && (
              <ToggleGroup
                type="single"
                value={String(blockIndex)}
                onValueChange={(v) => {
                  if (!v) return
                  setBlockIndex(Number(v))
                  analyse(text, Number(v))
                }}
                className="flex-wrap justify-start"
                data-import-blocks
              >
                {found.map((b, i) => <ToggleGroupItem key={i} value={String(i)} className="text-xs">{blockLabel(b, i)}</ToggleGroupItem>)}
              </ToggleGroup>
            )}

            {stage.kind === "importa" && <p className="text-sm text-muted-foreground">Disposizione in corso…</p>}
            {stage.kind === "analizzato" && !stage.result.ok && (
              <p className="text-sm text-destructive" data-import-error>
                {stage.result.at !== null && `Riga ${lineInText(stage.block, stage.result.at)}: `}{stage.result.message}
              </p>
            )}

            {stage.kind === "analizzato" && ready && (
              <>
                <p className="text-sm text-muted-foreground" data-import-summary>
                  {summary(ready)}
                </p>
                {ready.fragment.warnings.length > 0 && (
                  <details data-import-warnings>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{ready.fragment.warnings.length} avvisi</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {ready.fragment.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                    </ul>
                  </details>
                )}
                <ul className="space-y-1">
                  {Object.keys(fates).map((key) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox id={`m-${key}`} checked={chosen.has(key)} onCheckedChange={() => toggle(key)} />
                      <label htmlFor={`m-${key}`} className="cursor-pointer font-mono text-xs">{key}</label>
                      <span className={`ml-auto text-xs ${fates[key] === "nuovo" ? "text-primary" : "text-muted-foreground"}`}>{FATE_LABEL[fates[key] ?? "nuovo"]}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {ready && stage.kind === "analizzato" && (
            <>
              {readOnly && (
                <p className="mr-auto self-center text-xs text-muted-foreground" data-import-readonly>
                  Questo documento è aperto in un&apos;altra scheda: qui è in sola lettura.
                </p>
              )}
              <Button onClick={() => void onImport()} disabled={chosen.size === 0 || readOnly}>
                Importa {chosen.size} {NOUN[ready.kind]}
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => close(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
