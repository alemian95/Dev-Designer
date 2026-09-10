import { deleteItems, duplicateEntities } from "./commands/er"
import { documentStore } from "./document-store"
import { erDiagram } from "./er-access"
import { entityRect } from "./er/geometry"
import { rectsBounds } from "./geometry"
import { selId, selectedKeys, sessionStore } from "./session-store"
import { fitToRect, IDENTITY, zoomAt } from "./viewport"

/** Azioni condivise da toolbar e tastiera. Leggono gli store direttamente: niente React qui. */

export function deleteSelection(): void {
  const session = sessionStore.getState()
  const recipe = deleteItems(selectedKeys(session.selection, "node"), selectedKeys(session.selection, "edge"))
  if (recipe && documentStore.getState().dispatch(recipe)) session.setSelection([])
}

export function duplicateSelection(): void {
  const session = sessionStore.getState()
  const entities = selectedKeys(session.selection, "node")
  if (entities.length === 0) return
  const { keys, recipe } = duplicateEntities(erDiagram(documentStore.getState().doc).model, entities)
  if (documentStore.getState().dispatch(recipe)) session.setSelection(keys.map((k) => selId("node", k)))
}

export function selectAllNodes(): void {
  const keys = Object.keys(erDiagram(documentStore.getState().doc).model.entities)
  sessionStore.getState().setSelection(keys.map((k) => selId("node", k)))
}

export function fitToContent(): void {
  const d = erDiagram(documentStore.getState().doc)
  const rects = Object.entries(d.model.entities).flatMap(([key, entity]) => {
    const view = d.view.nodes[key]
    return view ? [entityRect(entity, view)] : []
  })
  const session = sessionStore.getState()
  session.setViewport(fitToRect(rectsBounds(rects), session.canvasSize))
}

export function zoomBy(factor: number): void {
  const session = sessionStore.getState()
  const center = { x: session.canvasSize.w / 2, y: session.canvasSize.h / 2 }
  session.setViewport(zoomAt(session.viewport, center, factor))
}

export function resetView(): void {
  sessionStore.getState().setViewport(IDENTITY)
}
