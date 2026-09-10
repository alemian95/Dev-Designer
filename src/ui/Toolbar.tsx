import { Copy, LayoutGrid, Maximize2, Moon, MousePointer2, Redo2, Spline, Square, Sun, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react"
import type { ReactNode } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { deleteSelection, duplicateSelection, fitToContent, zoomBy } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { sessionStore, type Tool } from "@/editor/session-store"
import { DocumentMenu } from "./DocumentMenu"
import { autoLayout, useCanAutoLayout } from "./layout-actions"
import { useTheme } from "./use-theme"

/** `TooltipTrigger asChild` sovrascrive il `data-state` del toggle: lo stato attivo si legge da `aria-checked`. */
const TOOL_ITEM = "aria-checked:bg-muted aria-checked:text-foreground"

function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function ZoomLabel() {
  const scale = useStore(sessionStore, (s) => s.viewport.scale)
  return <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
}

export function Toolbar() {
  const tool = useStore(sessionStore, (s) => s.tool)
  const setTool = useStore(sessionStore, (s) => s.setTool)
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
      <ToggleGroup type="single" value={tool} onValueChange={(v) => v && setTool(v as Tool)}>
        <Hint label="Seleziona (V)"><ToggleGroupItem value="select" aria-label="Seleziona" className={TOOL_ITEM}><MousePointer2 /></ToggleGroupItem></Hint>
        <Hint label="Entità (E)"><ToggleGroupItem value="node" aria-label="Entità" className={TOOL_ITEM}><Square /></ToggleGroupItem></Hint>
        <Hint label="Relazione (R)"><ToggleGroupItem value="edge" aria-label="Relazione" className={TOOL_ITEM}><Spline /></ToggleGroupItem></Hint>
      </ToggleGroup>
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
    </header>
  )
}
