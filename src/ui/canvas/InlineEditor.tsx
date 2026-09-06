import { useStore } from "zustand"
import { renameEntity } from "@/editor/commands/er"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { entitySize, FONT_SIZE, HEADER_H } from "@/editor/er-geometry"
import { selId, sessionStore } from "@/editor/session-store"
import { worldToScreen } from "@/editor/viewport"
import { entityKey } from "@/model/document"

/** Input HTML sovrapposto all'header dell'entità in editing. Un comando al commit; Escape annulla. */
export function InlineEditor() {
  const editing = useStore(sessionStore, (s) => s.editing)
  const viewport = useStore(sessionStore, (s) => s.viewport)
  const entity = useStore(documentStore, (s) => (editing ? erDiagram(s.doc).model.entities[editing.key] : undefined))
  const view = useStore(documentStore, (s) => (editing ? erDiagram(s.doc).view.nodes[editing.key] : undefined))
  if (!editing || !entity || !view) return null

  const { w } = entitySize(entity, view.collapsed)
  const tl = worldToScreen(viewport, { x: view.x, y: view.y })
  const close = () => sessionStore.getState().setEditing(null)
  const commit = (value: string) => {
    const recipe = renameEntity(editing.key, value, entity.schema)
    if (recipe && documentStore.getState().dispatch(recipe)) {
      sessionStore.getState().setSelection([selId("entity", entityKey({ name: value.trim(), schema: entity.schema }))])
    }
    close()
  }

  return (
    <input
      autoFocus
      defaultValue={entity.name}
      aria-label="Nome entità"
      className="absolute border border-primary bg-card text-center font-mono text-foreground outline-none"
      style={{ left: tl.x, top: tl.y, width: w * viewport.scale, height: HEADER_H * viewport.scale, fontSize: FONT_SIZE * viewport.scale }}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur()
        if (e.key === "Escape") {
          e.currentTarget.value = entity.name
          close()
        }
      }}
    />
  )
}
