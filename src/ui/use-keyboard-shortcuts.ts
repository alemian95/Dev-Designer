import { useEffect } from "react"
import { deleteSelection, duplicateSelection, fitToContent, resetView, selectAllEntities, zoomBy } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { sessionStore } from "@/editor/session-store"

/** Mentre si scrive in un campo di testo le scorciatoie non devono scattare. */
function inTextInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
}

function onKeyDown(e: KeyboardEvent): void {
  if (inTextInput(e.target)) return
  const mod = e.metaKey || e.ctrlKey
  const session = sessionStore.getState()
  const doc = documentStore.getState()
  const key = e.key.toLowerCase()
  let handled = true
  if (mod && key === "z" && e.shiftKey) doc.redo()
  else if (mod && key === "z") doc.undo()
  else if (mod && key === "y") doc.redo()
  else if (mod && key === "d") duplicateSelection()
  else if (mod && key === "a") selectAllEntities()
  else if (mod && (key === "=" || key === "+")) zoomBy(1.25)
  else if (mod && key === "-") zoomBy(0.8)
  else if (mod && key === "0") resetView()
  else if (!mod && (e.key === "Delete" || e.key === "Backspace")) deleteSelection()
  else if (!mod && key === "v") session.setTool("select")
  else if (!mod && key === "e") session.setTool("entity")
  else if (!mod && key === "r") session.setTool("relation")
  else if (!mod && key === "f") fitToContent()
  else if (e.key === "Escape") {
    session.setSelection([])
    session.setTool("select")
  } else handled = false
  if (handled) e.preventDefault()
}

/**
 * Scorciatoie globali. mod = cmd su macOS, ctrl altrove.
 * mod+z undo · mod+shift+z / mod+y redo · mod+d duplica · mod+a seleziona tutto · canc/backspace elimina
 * v/e/r tool · f fit · mod+= / mod+- zoom · mod+0 reset · esc deseleziona e torna al tool select
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])
}
