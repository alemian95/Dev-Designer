/**
 * PROTOTIPO, da buttare: tre varianti del dialog di import Mermaid, scelte con `?variant=A|B|C`
 * (ticket «Dialog dell'import Mermaid»). L'analisi è finta, niente scrive nel documento.
 * Vive solo sul branch `prototype/dialog-import-mermaid`.
 */
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type Fate = "nuovo" | "sostituito" | "identico"
type Item = { key: string; what: string; fate: Fate }
type Warning = { line: number | null; message: string }
type Analysis =
  | { ok: true; type: string; items: Item[]; edges: number; skippedEdges: number; notes: number; warnings: Warning[] }
  | { ok: false; type: string | null; line: number; message: string }

const SAMPLE = `classDiagram
  Animale <|-- Cane
  Animale <|-- Gatto
  Cane "1" --> "*" Osso : rosicchia
  class Animale {
    <<Abstract>>
    +String nome
    +verso()* String
  }
  class Cane {
    +abbaia() void
  }
  class Gatto~T~
  style Cane fill:#f9f
  note for Cane "fedele"
`

const SAMPLE_MD = `# Appunti

\`\`\`mermaid
erDiagram
  CLIENTE ||--o{ ORDINE : effettua
\`\`\`

Testo in mezzo.

\`\`\`mermaid
${SAMPLE}\`\`\`
`

/** Blocchi ```mermaid di un markdown; il testo intero se non ce ne sono. */
function blocks(text: string): string[] {
  const found = [...text.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]!)
  return found.length > 0 ? found : [text]
}

function detect(text: string): string | null {
  const first = text.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("%%"))
  const word = first?.split(/\s+/)[0]
  if (word === "erDiagram") return "ER"
  if (word === "classDiagram") return "Classi"
  if (word === "flowchart" || word === "graph") return "Flowchart"
  return word ?? null
}

/** Analisi finta: abbastanza per vedere come il dialog presenta esiti, sostituzioni, avvisi ed errori. */
function fakeAnalyse(text: string): Analysis {
  const type = detect(text)
  if (type === null) return { ok: false, type: null, line: 1, message: "Testo vuoto." }
  if (!["ER", "Classi", "Flowchart"].includes(type)) {
    return { ok: false, type, line: 1, message: `«${type}» non si importa: solo erDiagram, classDiagram e flowchart.` }
  }
  const lines = text.split("\n")
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    // Solo le graffe di blocco, non i marcatori `o{` delle cardinalità ER.
    depth += (/\{\s*$/.test(lines[i]!) ? 1 : 0) - (/^\s*\}\s*$/.test(lines[i]!) ? 1 : 0)
    if (depth < 0) return { ok: false, type, line: i + 1, message: "Graffa chiusa senza apertura." }
  }
  if (depth > 0) return { ok: false, type, line: lines.length, message: "Un blocco `{` non è mai chiuso." }

  const names = new Set<string>()
  for (const l of lines) {
    for (const m of l.matchAll(/\b([A-Z][A-Za-z]+)\b/g)) names.add(m[1]!)
  }
  for (const kw of ["String", "Abstract", "T"]) names.delete(kw)
  const what = type === "ER" ? "entità" : type === "Classi" ? "classe" : "nodo"
  const fates: Fate[] = ["nuovo", "sostituito", "nuovo", "identico"]
  const items = [...names].map((key, i) => ({ key, what, fate: type === "Flowchart" ? "nuovo" : fates[i % fates.length]! }))
  const warnings: Warning[] = []
  lines.forEach((l, i) => {
    if (/^\s*style\b/.test(l)) warnings.push({ line: i + 1, message: "`style` scartato: gli stili non si importano." })
    if (/~\w+~\s*$/.test(l) && /class /.test(l)) warnings.push({ line: i + 1, message: "Parametro generico della classe scartato." })
  })
  warnings.push({ line: null, message: "La direzione del diagramma si ignora: il layout segue «Disponi»." })
  return {
    ok: true, type, items,
    edges: lines.filter((l) => /--|\.\./.test(l)).length,
    skippedEdges: 1,
    notes: lines.filter((l) => /^\s*note\b/.test(l)).length,
    warnings,
  }
}

const FATE_LABEL: Record<Fate, string> = { nuovo: "nuovo", sostituito: "sostituisce", identico: "identico, saltato" }
const FATE_CLASS: Record<Fate, string> = { nuovo: "text-primary", sostituito: "text-amber-600", identico: "text-muted-foreground" }

function useAnalysis(text: string) {
  return useMemo(() => (text.trim() ? fakeAnalyse(text) : null), [text])
}

async function readFile(e: React.ChangeEvent<HTMLInputElement>): Promise<string | null> {
  const file = e.target.files?.[0]
  return file ? await file.text() : null
}

type Props = { open: boolean; onOpenChange: (open: boolean) => void }
type VariantProps = Props & { bar: React.ReactNode }

/* ───────────── A: gemello del DDL ───────────── */

/** Stesso schema di «Importa DDL»: testo → Analizza → lista con caselle → Importa N. */
function VariantA({ open, onOpenChange, bar }: VariantProps) {
  const [text, setText] = useState(SAMPLE)
  const [analysed, setAnalysed] = useState<string | null>(null)
  const result = useAnalysis(analysed ?? "")
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const analyse = (block: string) => {
    const r = fakeAnalyse(block)
    setAnalysed(block)
    if (r.ok) setChosen(new Set(r.items.filter((i) => i.fate !== "identico").map((i) => i.key)))
  }
  const allBlocks = blocks(text)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importa Mermaid</DialogTitle>
          <DialogDescription>Incolla o carica un erDiagram, classDiagram o flowchart: entra nel diagramma aperto, in un solo passo annullabile.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto">
          <textarea aria-label="Mermaid" value={text} onChange={(e) => { setText(e.target.value); setAnalysed(null) }}
            className="h-40 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs" />
          <div className="flex items-center gap-2">
            <input type="file" accept=".mmd,.mermaid,.md,.txt" className="text-xs"
              onChange={(e) => void readFile(e).then((t) => t !== null && (setText(t), setAnalysed(null)))} />
            <Button variant="ghost" size="sm" onClick={() => { setText(SAMPLE_MD); setAnalysed(null) }}>Esempio .md</Button>
            <Button variant="secondary" size="sm" className="ml-auto" disabled={!text.trim()} onClick={() => analyse(allBlocks[allBlocks.length - 1]!)}>Analizza</Button>
          </div>
          {allBlocks.length > 1 && analysed !== null && (
            <p className="text-xs text-muted-foreground">Il file ha {allBlocks.length} blocchi mermaid: si importa l&apos;ultimo.</p>
          )}
          {result && !result.ok && <p className="text-sm text-destructive">Riga {result.line}: {result.message}</p>}
          {result?.ok && (
            <>
              <p className="text-sm text-muted-foreground">
                {result.type}: {result.items.length} elementi, {result.edges} relazioni ({result.skippedEdges} già presenti), {result.notes} note
              </p>
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">{result.warnings.length} avvisi</summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                  {result.warnings.map((w, i) => <li key={i}>{w.line !== null && `Riga ${w.line}: `}{w.message}</li>)}
                </ul>
              </details>
              <ul className="space-y-1">
                {result.items.map((it) => (
                  <li key={it.key} className="flex items-center gap-2 text-sm">
                    <Checkbox id={`m-${it.key}`} checked={chosen.has(it.key)}
                      onCheckedChange={() => setChosen((s) => { const n = new Set(s); if (n.has(it.key)) n.delete(it.key); else n.add(it.key); return n })} />
                    <label htmlFor={`m-${it.key}`} className="font-mono text-xs">{it.key}</label>
                    <span className={`ml-auto text-xs ${FATE_CLASS[it.fate]}`}>{FATE_LABEL[it.fate]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <DialogFooter>
          {bar}
          {result?.ok && <Button disabled={chosen.size === 0}>Importa {chosen.size} elementi</Button>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────── B: un solo «Importa…», analisi dal vivo ───────────── */

/** Un dialog unico per DDL e Mermaid; il formato si riconosce da solo, niente pulsante Analizza, niente selezione. */
function VariantB({ open, onOpenChange, bar }: VariantProps) {
  const [text, setText] = useState(SAMPLE_MD)
  const allBlocks = blocks(text)
  const [blockIndex, setBlockIndex] = useState(0)
  const current = allBlocks[Math.min(blockIndex, allBlocks.length - 1)]!
  const looksSql = /^\s*(create|alter|--)/i.test(text)
  const result = useAnalysis(looksSql ? "" : current)
  const count = (f: Fate) => (result?.ok ? result.items.filter((i) => i.fate === f).length : 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importa</DialogTitle>
          <DialogDescription>DDL PostgreSQL o MySQL, oppure Mermaid: il formato si riconosce da sé.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border px-2 py-0.5">
              {looksSql ? "DDL" : result === null ? "—" : result.type ? `Mermaid · ${result.type}` : "?"}
            </span>
            <input type="file" accept=".sql,.mmd,.mermaid,.md,.txt" className="ml-auto text-xs"
              onChange={(e) => void readFile(e).then((t) => t !== null && setText(t))} />
          </div>
          <textarea aria-label="Testo da importare" value={text} onChange={(e) => setText(e.target.value)}
            className="h-36 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs" />
          {allBlocks.length > 1 && (
            <ToggleGroup type="single" value={String(blockIndex)} onValueChange={(v) => v && setBlockIndex(Number(v))} className="justify-start">
              {allBlocks.map((b, i) => <ToggleGroupItem key={i} value={String(i)} className="text-xs">Blocco {i + 1} · {detect(b)}</ToggleGroupItem>)}
            </ToggleGroup>
          )}
          {looksSql && <p className="text-sm text-muted-foreground">Qui proseguirebbe il flusso DDL di oggi (dialetto, tabelle).</p>}
          {result && !result.ok && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Non si importa niente. Riga {result.line}: {result.message}
            </div>
          )}
          {result?.ok && (
            <div className="grid grid-cols-3 gap-2 text-center">
              {(["nuovo", "sostituito", "identico"] as const).map((f) => (
                <div key={f} className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{count(f)}</div>
                  <div className="text-xs text-muted-foreground">{f === "nuovo" ? "nuovi" : f === "sostituito" ? "sostituiti" : "già uguali"}</div>
                </div>
              ))}
              <p className="col-span-3 text-left text-xs text-muted-foreground">
                {result.edges} relazioni, {result.notes} note. {result.warnings.length} cose non entrano: {result.warnings.map((w) => w.message).join(" ")}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          {bar}
          <Button disabled={!result?.ok}>Importa</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────── C: editor a sinistra, esito a destra ───────────── */

/** Due colonne: il testo con i numeri di riga e la riga in errore evidenziata; a destra l'esito raggruppato, avvisi cliccabili. */
function VariantC({ open, onOpenChange, bar }: VariantProps) {
  const [text, setText] = useState(SAMPLE)
  const [focusLine, setFocusLine] = useState<number | null>(null)
  const result = useAnalysis(text)
  const lines = text.split("\n")
  const bad = result && !result.ok ? result.line : null
  const groups: [Fate, string][] = [["nuovo", "Entrano"], ["sostituito", "Sostituiscono quelli presenti"], ["identico", "Già uguali, saltati"]]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Importa Mermaid {result?.type ? `· ${result.type}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-[3fr_2fr] gap-4">
          <div className="flex min-h-0 overflow-auto rounded-md border font-mono text-xs">
            <div className="select-none border-r bg-muted/40 px-2 py-2 text-right text-muted-foreground">
              {lines.map((_, i) => (
                <div key={i} className={i + 1 === bad ? "bg-destructive/20 text-destructive" : i + 1 === focusLine ? "bg-amber-200/60" : ""}>{i + 1}</div>
              ))}
            </div>
            <textarea aria-label="Mermaid" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false}
              className="flex-1 resize-none bg-transparent px-2 py-2 leading-[inherit] outline-none" style={{ lineHeight: "1rem" }} />
          </div>
          <div className="min-h-0 space-y-4 overflow-auto text-sm">
            {result === null && <p className="text-muted-foreground">Incolla un diagramma a sinistra.</p>}
            {result && !result.ok && <p className="text-destructive">Riga {result.line}: {result.message}</p>}
            {result?.ok && groups.map(([fate, title]) => {
              const items = result.items.filter((i) => i.fate === fate)
              if (items.length === 0) return null
              return (
                <section key={fate}>
                  <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">{title} · {items.length}</h3>
                  <div className="flex flex-wrap gap-1">
                    {items.map((i) => <span key={i.key} className={`rounded border px-1.5 py-0.5 font-mono text-xs ${FATE_CLASS[fate]}`}>{i.key}</span>)}
                  </div>
                </section>
              )
            })}
            {result?.ok && (
              <section>
                <h3 className="mb-1 text-xs font-medium uppercase text-muted-foreground">Non entra · {result.warnings.length}</h3>
                <ul className="space-y-1 text-xs">
                  {result.warnings.map((w, i) => (
                    <li key={i}>
                      <button type="button" className="text-left hover:underline" onClick={() => setFocusLine(w.line)}>
                        {w.line !== null && <span className="font-mono text-muted-foreground">r.{w.line} </span>}{w.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
        <DialogFooter>
          {bar}
          <input type="file" accept=".mmd,.mermaid,.md,.txt" className="mr-auto text-xs"
            onChange={(e) => void readFile(e).then((t) => t !== null && setText(blocks(t)[0]!))} />
          <Button disabled={!result?.ok}>Importa</Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ───────────── switcher ───────────── */

const VARIANTS = [
  { key: "A", name: "Gemello del DDL", C: VariantA },
  { key: "B", name: "Importa unico, dal vivo", C: VariantB },
  { key: "C", name: "Editor + esito", C: VariantC },
] as const

function currentKey(): string {
  return new URLSearchParams(location.search).get("variant") ?? "A"
}

export function ImportMermaidDialogPrototype(props: Props) {
  const [key, setKey] = useState(currentKey)
  const index = Math.max(0, VARIANTS.findIndex((v) => v.key === key))
  const go = (delta: number) => {
    const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]!.key
    const url = new URL(location.href)
    url.searchParams.set("variant", next)
    history.replaceState(null, "", url)
    setKey(next)
  }
  useEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return
      if (e.key === "ArrowLeft") go(-1)
      if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
  const { C, name } = VARIANTS[index]!
  const bar = (
    <div className="mr-auto flex items-center gap-3 rounded-full bg-black px-4 py-1.5 text-xs text-white shadow-lg">
      <button type="button" onClick={() => go(-1)} aria-label="Variante precedente">←</button>
      <span>PROTOTIPO {VARIANTS[index]!.key} ({name})</span>
      <button type="button" onClick={() => go(1)} aria-label="Variante successiva">→</button>
    </div>
  )
  return <C key={key} {...props} bar={bar} />
}
