import { documentStore } from "@/editor/document-store"

/** `/` e i caratteri vietati nei nomi di file troncherebbero il nome del file scaricato. */
export function documentFileName(extension: string): string {
  const name = documentStore.getState().doc.name.trim() || "diagramma"
  return `${name.replaceAll(/[\\/:*?"<>|]/g, "-")}.${extension}`
}
