import { MousePointer2 } from "lucide-react"
import { useStore } from "zustand"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { sessionStore } from "@/editor/session-store"
import { toolId, useDiagramView, type ToolDef } from "./canvas/kinds/registry"
import { Hint } from "./Hint"

/** `TooltipTrigger asChild` sovrascrive il `data-state` del toggle: lo stato attivo si legge da `aria-checked`. */
const TOOL_ITEM = "aria-checked:bg-muted aria-checked:text-foreground"

/** Un pulsante di `view.tools`: il tooltip compone `label` e `key`, come faceva il testo cablato. */
function ToolItem({ def }: { def: ToolDef }) {
  return (
    <Hint label={`${def.label} (${def.key.toUpperCase()})`} side="right">
      <ToggleGroupItem value={toolId(def)} aria-label={def.label} className={TOOL_ITEM}><def.Icon /></ToggleGroupItem>
    </Hint>
  )
}

/** Gli strumenti del canvas in colonna, a sinistra: «Seleziona» più quelli che il tipo di diagramma dichiara. */
export function ToolSidebar() {
  const tool = useStore(sessionStore, (s) => s.tool)
  const variant = useStore(sessionStore, (s) => s.variant)
  const setTool = useStore(sessionStore, (s) => s.setTool)
  const view = useDiagramView()
  const current = toolId({ tool, variant: variant ?? undefined })

  return (
    <nav aria-label="Strumenti" className="flex flex-col items-center border-r py-2">
      <ToggleGroup
        type="single"
        orientation="vertical"
        className="flex-col"
        value={current}
        onValueChange={(v) => {
          if (!v) return
          if (v === "select") return setTool("select")
          const def = view.tools.find((t) => toolId(t) === v)
          if (def) setTool(def.tool, def.variant ?? null)
        }}
      >
        <Hint label="Seleziona (V)" side="right"><ToggleGroupItem value="select" aria-label="Seleziona" className={TOOL_ITEM}><MousePointer2 /></ToggleGroupItem></Hint>
        {view.tools.map((def) => <ToolItem key={toolId(def)} def={def} />)}
      </ToggleGroup>
    </nav>
  )
}
