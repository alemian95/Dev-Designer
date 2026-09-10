import { Box, ChevronDown, ClipboardCopy, FileCode2, FileImage, FilePlus2, FileText, FolderOpen, Image, Save, SaveAll, Square } from "lucide-react"
import { useState, type ChangeEvent } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { documentStore } from "@/editor/document-store"
import { documentDb, documentIo } from "@/io/app-io"
import type { RecentEntry } from "@/io/db"
import { documentSession } from "@/io/document-session"
import { readFile } from "@/io/file"
import { requestOpen, UPLOAD_INPUT_ID } from "./document-actions"
import { copyPng, exportPng, exportSvg } from "./export/lazy"
import { TextExportDialog } from "./export/TextExportDialog"
import { ImportDdlDialog } from "./import/ImportDdlDialog"

const when = new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" })

/** Nome del documento, pallino delle modifiche non salvate, e il menu: nuovo, apri, salva, salva con nome, recenti. */
export function DocumentMenu() {
  const name = useStore(documentStore, (s) => s.doc.name)
  // L'import DDL è un'entrata solo ER (§2 della spec del class diagram): sulle classi la voce
  // resta ma non fa niente di sensato, quindi si disabilita come già succede in sola lettura.
  const isEr = useStore(documentStore, (s) => s.doc.diagram.type === "er")
  const docId = useStore(documentSession, (s) => s.docId)
  const dirty = useStore(documentSession, (s) => s.dirty)
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [textExportOpen, setTextExportOpen] = useState(false)

  // I recenti si leggono all'apertura del menu, non a ogni render.
  const onOpenChange = (open: boolean) => {
    if (open) void documentDb.listRecent().then(setRecent, () => setRecent([]))
  }

  const onUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (file) await documentIo.openFile(await readFile(file))
  }

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" data-document-menu className="gap-1 font-medium">
            {/* Il nome è anche il nome accessibile del pulsante: un file col nome vuoto lo lascerebbe senza. */}
            <span className="max-w-48 truncate">{name || "Senza titolo"}</span>
            {dirty && <span aria-label="Modifiche non salvate" title="Modifiche non salvate" className="text-primary">●</span>}
            <ChevronDown className="size-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger><FilePlus2 /> Nuovo</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => void documentIo.newDocument("er")}><Square /> Diagramma ER</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void documentIo.newDocument("class")}><Box /> Class diagram</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={requestOpen}><FolderOpen /> Apri… <DropdownMenuShortcut>⌘O</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly || !isEr} onSelect={() => setImportOpen(true)}><FileCode2 /> Importa DDL…</DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly} onSelect={() => void documentIo.save()}><Save /> Salva <DropdownMenuShortcut>⌘S</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem disabled={readOnly} onSelect={() => void documentIo.saveAs()}><SaveAll /> Salva con nome… <DropdownMenuShortcut>⇧⌘S</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* L'export è una lettura: funziona anche in sola lettura. */}
          <DropdownMenuItem onSelect={() => void exportSvg()}><FileImage /> Esporta SVG</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportPng()}><Image /> Esporta PNG</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyPng()}><ClipboardCopy /> Copia PNG</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTextExportOpen(true)}><FileText /> Esporta testo…</DropdownMenuItem>
          {recent.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Recenti</DropdownMenuLabel>
              {recent.map((r) => (
                <DropdownMenuItem key={r.id} disabled={r.id === docId} onSelect={() => void documentIo.openRecent(r.id)}>
                  <span className="truncate">{r.name}</span>
                  <span className="ml-auto pl-3 text-xs text-muted-foreground">{when.format(r.updatedAt)}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Fallback senza File System Access API: l'e2e lo riempie con setInputFiles. */}
      <input id={UPLOAD_INPUT_ID} type="file" accept=".dd.json,application/json" hidden aria-label="Carica documento" onChange={(e) => void onUpload(e)} />
      {/* Fratello del DropdownMenu, non figlio: aperto dalla voce di menu, litigherebbe sul fuoco col menu che si chiude. */}
      <ImportDdlDialog open={importOpen} onOpenChange={setImportOpen} />
      <TextExportDialog open={textExportOpen} onOpenChange={setTextExportOpen} />
    </>
  )
}
