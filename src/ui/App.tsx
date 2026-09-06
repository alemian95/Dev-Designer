import { TooltipProvider } from "@/components/ui/tooltip"
import { Canvas } from "./canvas/Canvas"
import { Toolbar } from "./Toolbar"
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts"

export default function App() {
  useKeyboardShortcuts()
  return (
    <TooltipProvider>
      <div className="grid h-screen grid-rows-[auto_1fr] bg-background text-foreground">
        <Toolbar />
        <Canvas />
      </div>
    </TooltipProvider>
  )
}
