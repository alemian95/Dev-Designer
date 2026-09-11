import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { importEr } from "@/editor/commands/import"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { detectDialect } from "@/io/ddl/detect"
import { mapToEr } from "@/io/ddl/map"
import { createParser, type DdlParser } from "@/io/ddl/parse-client"
import type { DdlParseResult, Dialect, SqlTable } from "@/io/ddl/schema"
import { spawnParseWorker } from "@/io/ddl/spawn"
import { documentSession } from "@/io/document-session"
import { entityKey } from "@/model/er/schema"

/** Etichette per i tipi di statement più frequenti; per gli altri si ricava un'etichetta leggibile. */
const SKIPPED_LABELS: Record<string, string> = {
  IndexStmt: "indici",
  CreateSeqStmt: "sequenze",
  AlterSeqStmt: "sequenze",
  CreateSchemaStmt: "schemi",
  CommentStmt: "commenti",
  VariableSetStmt: "SET di sessione",
  ViewStmt: "viste",
  CreateTrigStmt: "trigger",
  CreateFunctionStmt: "funzioni",
  GrantStmt: "permessi",
  CreateEnumStmt: "tipi enum",
  "drop:table": "DROP TABLE",
  "insert:undefined": "righe di dati",
  "set:undefined": "SET di sessione",
  "commento eseguibile": "commenti eseguibili",
  "meta-comando psql": "meta-comandi psql",
}

/**
 * `skipped` mescola quattro vocabolari (nodi Postgres, sottotipi `AT_*` di un ALTER, le forme
 * `type:keyword` di node-sql-parser, frasi italiane già pronte): non ha senso mapparli tutti, ma
 * una chiave ignota non deve mai arrivare grezza all'utente (la revisione ha visto comparire
 * `use:undefined`). Ripulita di prefissi/suffissi da programmatore e spaziata sul cambio di caso,
 * resta leggibile pur non tradotta.
 */
const humanizeSkipped = (kind: string): string => {
  const known = SKIPPED_LABELS[kind]
  if (known) return known
  const cleaned = kind
    .replace(/^AT_/, "")
    .replace(/Stmt$/, "")
    .replace(/:undefined$/, "")
    .replace(/:/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase()
  return cleaned || "altre istruzioni"
}

type Stage =
  | { kind: "vuoto" }
  | { kind: "analisi" }
  | { kind: "pronto"; result: DdlParseResult }
  | { kind: "errore"; message: string }
  | { kind: "fatto"; tables: number; relationships: number; warnings: string[] }

const keyOf = (t: SqlTable): string => entityKey({ name: t.name, schema: t.schema })

const summary = (skipped: Record<string, number>): string =>
  Object.entries(skipped)
    .map(([kind, n]) => `${n} ${humanizeSkipped(kind)}`)
    .join(", ")

export function ImportDdlDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [text, setText] = useState("")
  const [dialect, setDialect] = useState<Dialect>("postgres")
  const [stage, setStage] = useState<Stage>({ kind: "vuoto" })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")
  const parser = useRef<DdlParser | null>(null)
  // Si incrementa a ogni `analyse` e a ogni chiusura: la risoluzione di un'analisi si applica solo
  // se la generazione è ancora quella corrente. Senza questa guardia un'analisi lenta e superata da
  // un'altra (l'utente incolla un dump grosso, poi uno piccolo prima che il primo risponda)
  // potrebbe sovrascrivere lo stato più recente, e chiudere il dialog mentre analizza farebbe
  // comparire un errore fantasma alla riapertura (il rigetto di `dispose` arriva un microtask dopo
  // l'azzeramento sincrono dello stato).
  const generation = useRef(0)

  // Iscrizione e non `getState()`: il render deve essere puro, e dopo un import la lista si riaggiorna.
  const doc = useStore(documentStore, (s) => s.doc)
  // `erDiagram` solleva su un documento di classi: l'import DDL è un'entrata solo ER (§2 della
  // spec del class diagram), quindi qui non c'è nulla di "già presente" da segnalare.
  const present = new Set(doc.diagram.type === "er" ? Object.keys(erDiagram(doc).model.entities) : [])
  // Iscrizione, non lettura una tantum: la sola lettura può sopravvenire mentre il dialog è aperto
  // (un'altra scheda prende il controllo), e lo stato deve reagire, non essere letto una sola volta.
  const readOnly = useStore(documentSession, (s) => s.readOnly)

  const analyse = async (ddl: string, which: Dialect) => {
    const gen = ++generation.current
    setStage({ kind: "analisi" })
    parser.current ??= createParser(spawnParseWorker)
    try {
      const result = await parser.current.parse(ddl, which)
      if (generation.current !== gen) return // superata da un'analisi più recente
      setChosen(new Set(result.tables.map(keyOf)))
      setStage({ kind: "pronto", result })
    } catch (e) {
      if (generation.current !== gen) return
      setStage({ kind: "errore", message: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Il testo che arriva da una incollata o da un file si analizza da sé; quello digitato col pulsante. */
  const receive = (ddl: string) => {
    setText(ddl)
    const which = detectDialect(ddl)
    setDialect(which)
    void analyse(ddl, which)
  }

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const ddl = e.clipboardData.getData("text")
    if (!ddl) return
    e.preventDefault()
    receive(ddl)
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) receive(await file.text())
  }

  const onImport = () => {
    // Guardia anche qui, non solo su `disabled` del pulsante: la sola lettura può sopravvenire fra
    // il render e il click, ed è l'unica superficie di scrittura del progetto che altrimenti la
    // scavalca (il dialog vive in un portale fuori dal velo di sola lettura di App.tsx, e
    // `documentStore.dispatch` non ha guardie proprie). L'analisi resta permessa: è innocua, non scrive.
    if (stage.kind !== "pronto" || documentSession.getState().readOnly) return
    const tables = stage.result.tables.filter((t) => chosen.has(keyOf(t)))
    const model = erDiagram(documentStore.getState().doc).model
    const { entities, relationships, warnings } = mapToEr({ tables, model })
    documentStore.getState().dispatch(importEr(entities, relationships))
    setStage({ kind: "fatto", tables: Object.keys(entities).length, relationships: relationships.length, warnings })
  }

  const close = (next: boolean) => {
    if (!next) {
      // Invalida prima qualunque analisi in corso: la sua risoluzione (o il rigetto che `dispose`
      // sta per causare) arriverà dopo, e non deve più toccare uno stato che l'utente ha chiuso —
      // un annullamento voluto non è un errore, quindi non deve produrre uno stage "errore".
      generation.current++
      // Terminare il worker è ciò che rende immediato l'annullamento e non lascia lavoro orfano.
      parser.current?.dispose()
      parser.current = null
      setText("")
      setStage({ kind: "vuoto" })
      setChosen(new Set())
      setFilter("")
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

  const visible = stage.kind === "pronto" ? stage.result.tables.filter((t) => keyOf(t).includes(filter.trim())) : []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl" data-import-dialog>
        <DialogHeader>
          <DialogTitle>Importa DDL</DialogTitle>
          <DialogDescription>
            Incolla o carica un dump PostgreSQL o MySQL: le tabelle scelte entrano nel diagramma aperto,
            in un solo passo annullabile.
          </DialogDescription>
        </DialogHeader>

        {stage.kind === "fatto" ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto text-sm">
            <p>
              Importate <strong>{stage.tables}</strong> tabelle e <strong>{stage.relationships}</strong> relazioni.
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
              aria-label="DDL"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              placeholder="CREATE TABLE …"
              className="h-32 w-full resize-y rounded-md border bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="flex items-center gap-2">
              <input type="file" accept=".sql,.txt" aria-label="Carica un file SQL" onChange={(e) => void onFile(e)} className="text-xs" />
              <ToggleGroup type="single" value={dialect} onValueChange={(v) => v && setDialect(v as Dialect)} className="ml-auto">
                <ToggleGroupItem value="postgres">PostgreSQL</ToggleGroupItem>
                <ToggleGroupItem value="mysql">MySQL</ToggleGroupItem>
              </ToggleGroup>
              <Button variant="secondary" size="sm" disabled={!text.trim() || stage.kind === "analisi"} onClick={() => void analyse(text, dialect)}>
                Analizza
              </Button>
            </div>

            {stage.kind === "analisi" && <p className="text-sm text-muted-foreground">Analisi in corso…</p>}
            {stage.kind === "errore" && <p className="text-sm text-destructive" data-import-error>{stage.message}</p>}

            {stage.kind === "pronto" && (
              <>
                <p className="text-sm text-muted-foreground" data-import-summary>
                  {stage.result.tables.length} tabelle, {stage.result.tables.flatMap((t) => t.foreignKeys).length} foreign key
                  {Object.keys(stage.result.skipped).length > 0 && `. Ignorati: ${summary(stage.result.skipped)}`}
                </p>
                {stage.result.warnings.length > 0 && (
                  <details data-import-warnings>
                    <summary className="cursor-pointer text-xs text-muted-foreground">{stage.result.warnings.length} avvisi dal parser</summary>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                      {stage.result.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
                    </ul>
                  </details>
                )}
                <input
                  aria-label="Filtra tabelle"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtra…"
                  className="w-full rounded-md border bg-transparent px-3 py-1.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
                <ul className="space-y-1">
                  {visible.map((t) => {
                    const key = keyOf(t)
                    return (
                      <li key={key} className="flex items-center gap-2 text-sm">
                        <Checkbox id={`t-${key}`} checked={chosen.has(key)} onCheckedChange={() => toggle(key)} />
                        <label htmlFor={`t-${key}`} className="cursor-pointer font-mono text-xs">{key}</label>
                        <span className="text-xs text-muted-foreground">{t.columns.length} colonne</span>
                        {present.has(key) && <span className="ml-auto text-xs text-primary">già presente, verrà aggiornata</span>}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {stage.kind === "pronto" && (
            <>
              {/* Stessa voce di NoticeBar: l'analisi resta innocua in sola lettura, solo l'import scrive. */}
              {readOnly && (
                <p className="mr-auto self-center text-xs text-muted-foreground" data-import-readonly>
                  Questo documento è aperto in un&apos;altra scheda: qui è in sola lettura.
                </p>
              )}
              <Button onClick={onImport} disabled={chosen.size === 0 || readOnly}>
                Importa {chosen.size} tabelle
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={() => close(false)}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
