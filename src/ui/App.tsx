import { TooltipProvider } from "@/components/ui/tooltip"
import { Canvas } from "./canvas/Canvas"
import { IssuesPanel } from "./panels/IssuesPanel"
import { PropertiesPanel } from "./panels/PropertiesPanel"
import { Toolbar } from "./Toolbar"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

export default function App() {
  useKeyboardShortcuts()
  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_1fr] bg-background text-foreground">
        <Toolbar />
        <div className="grid min-h-0 grid-cols-[1fr_320px]">
          <Canvas />
          <aside className="flex min-h-0 flex-col border-l">
            <div className="min-h-0 flex-1 overflow-auto"><PropertiesPanel /></div>
            <IssuesPanel />
          </aside>
        </div>
      </div>
    </TooltipProvider>
  )
}
