import { documentStore } from "./document-store"
import { rectsBounds } from "./geometry"
import { opsFor } from "./kinds/ops"
import { selId, selectedKeys, sessionStore } from "./session-store"
import { fitToRect, IDENTITY, zoomAt } from "./viewport"

/** Azioni condivise da toolbar e tastiera. Leggono gli store direttamente: niente React qui. */

export function deleteSelection(): void {
  const session = sessionStore.getState()
  const ops = opsFor(documentStore.getState().doc)
  const recipe = ops.deleteItems(selectedKeys(session.selection, "node"), selectedKeys(session.selection, "edge"))
  if (recipe && documentStore.getState().dispatch(recipe)) session.setSelection([])
}

export function duplicateSelection(): void {
  const session = sessionStore.getState()
  const nodes = selectedKeys(session.selection, "node")
  if (nodes.length === 0) return
  const { keys, recipe } = opsFor(documentStore.getState().doc).duplicateNodes(nodes)
  if (documentStore.getState().dispatch(recipe)) session.setSelection(keys.map((k) => selId("node", k)))
}

export function selectAllNodes(): void {
  const keys = opsFor(documentStore.getState().doc).nodeKeys()
  sessionStore.getState().setSelection(keys.map((k) => selId("node", k)))
}

export function fitToContent(): void {
  const ops = opsFor(documentStore.getState().doc)
  const rects = ops.nodeKeys().flatMap((key) => ops.rectOf(key) ?? [])
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
