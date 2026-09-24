import { Copy, LayoutGrid, Maximize2, Moon, Redo2, Sun, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { deleteSelection, duplicateSelection, fitToContent, zoomBy } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"
import { About } from "./About"
import { DocumentMenu } from "./DocumentMenu"
import { Hint } from "./Hint"
import { autoLayout, useCanAutoLayout } from "./layout-actions"
import { useTheme } from "./use-theme"

function ZoomLabel() {
  const scale = useStore(sessionStore, (s) => s.viewport.scale)
  return <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
}

export function Toolbar() {
  const canUndo = useStore(documentStore, (s) => s.past.length > 0)
  const canRedo = useStore(documentStore, (s) => s.future.length > 0)
  const hasSelection = useStore(sessionStore, (s) => s.selection.size > 0)
  const canLayout = useCanAutoLayout()
  const { theme, toggle } = useTheme()

  return (
    <header className="flex h-12 items-center gap-2 border-b px-3">
      <span className="text-sm font-semibold">Dev Designer</span>
      <DocumentMenu />
      <Separator orientation="vertical" className="h-6" />
      <Hint label="Annulla (⌘Z)"><Button variant="ghost" size="icon" aria-label="Annulla" disabled={!canUndo} onClick={() => documentStore.getState().undo()}><Undo2 /></Button></Hint>
      <Hint label="Ripeti (⇧⌘Z)"><Button variant="ghost" size="icon" aria-label="Ripeti" disabled={!canRedo} onClick={() => documentStore.getState().redo()}><Redo2 /></Button></Hint>
      <Separator orientation="vertical" className="h-6" />
      <Hint label="Duplica (⌘D)"><Button variant="ghost" size="icon" aria-label="Duplica" disabled={!hasSelection} onClick={duplicateSelection}><Copy /></Button></Hint>
      <Hint label="Elimina (⌫)"><Button variant="ghost" size="icon" aria-label="Elimina" disabled={!hasSelection} onClick={deleteSelection}><Trash2 /></Button></Hint>
      <Separator orientation="vertical" className="h-6" />
      <Hint label="Riduci (⌘-)"><Button variant="ghost" size="icon" aria-label="Riduci zoom" onClick={() => zoomBy(0.8)}><ZoomOut /></Button></Hint>
      <ZoomLabel />
      <Hint label="Ingrandisci (⌘+)"><Button variant="ghost" size="icon" aria-label="Ingrandisci zoom" onClick={() => zoomBy(1.25)}><ZoomIn /></Button></Hint>
      <Hint label="Adatta (F)"><Button variant="ghost" size="icon" aria-label="Adatta" onClick={fitToContent}><Maximize2 /></Button></Hint>
      <Hint label="Disponi (L)">
        <Button variant="ghost" size="icon" aria-label="Disponi" disabled={!canLayout} onClick={() => void autoLayout()}>
          <LayoutGrid />
        </Button>
      </Hint>
      <div className="ml-auto" />
      <Hint label={theme === "dark" ? "Tema chiaro" : "Tema scuro"}>
        <Button variant="ghost" size="icon" aria-label={theme === "dark" ? "Tema chiaro" : "Tema scuro"} onClick={toggle}>{theme === "dark" ? <Sun /> : <Moon />}</Button>
      </Hint>
      <About />
    </header>
  )
}
