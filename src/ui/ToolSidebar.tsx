import { MousePointer2 } from "lucide-react"
import { useStore } from "zustand"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { sessionStore } from "@/editor/session-store"
import { canvasTools, FAMILY_LABEL, LINK_TOOL, toolId, useDocumentFamilies, type ToolDef } from "./canvas/kinds/registry"
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

/** Gli strumenti del canvas in colonna, a sinistra: Seleziona, gli strumenti di ogni famiglia del documento in gruppi, e Collega. */
export function ToolSidebar() {
  const tool = useStore(sessionStore, (s) => s.tool)
  const family = useStore(sessionStore, (s) => s.family)
  const variant = useStore(sessionStore, (s) => s.variant)
  const setTool = useStore(sessionStore, (s) => s.setTool)
  const families = useDocumentFamilies()
  const tools = canvasTools(families)
  const current = toolId({ tool, family, variant: variant ?? undefined })

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
          const def = tools.find((t) => toolId(t) === v)
          if (def) setTool(def.tool, def.family, def.variant ?? null)
        }}
      >
        <Hint label="Seleziona (V)" side="right"><ToggleGroupItem value="select" aria-label="Seleziona" className={TOOL_ITEM}><MousePointer2 /></ToggleGroupItem></Hint>
        {families.map((f) => (
          <div key={f} role="group" aria-label={FAMILY_LABEL[f]} className="mt-1 flex flex-col border-t pt-1">
            {tools.filter((t) => t.family === f).map((def) => <ToolItem key={toolId(def)} def={def} />)}
          </div>
        ))}
        <div className="mt-1 flex flex-col border-t pt-1"><ToolItem def={LINK_TOOL} /></div>
      </ToggleGroup>
    </nav>
  )
}
