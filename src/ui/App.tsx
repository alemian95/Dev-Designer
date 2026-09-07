import { useStore } from "zustand"
import { cn } from "cn"
import { TooltipProvider } from "@/components/ui/tooltip"
import { documentSession } from "@/io/document-session"
import { Canvas } from "./canvas/Canvas"
import { NoticeBar } from "./NoticeBar"
import { IssuesPanel } from "./panels/IssuesPanel"
import { PropertiesPanel } from "./panels/PropertiesPanel"
import { Toolbar } from "./Toolbar"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

export default function App() {
  useKeyboardShortcuts()
  const readOnly = useStore(documentSession, (s) => s.readOnly)
  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_auto_1fr] bg-background text-foreground">
        <Toolbar />
        <NoticeBar />
        {/* Sola lettura: un velo sul contenuto, la barra sopra resta cliccabile (spec §5). */}
        <div className={cn("grid min-h-0 grid-cols-[1fr_320px]", readOnly && "pointer-events-none select-none opacity-70")}>
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
