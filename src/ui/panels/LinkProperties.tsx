import { useMemo } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { deleteSelection } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { splitKey } from "@/editor/families"
import { LINK_TITLE } from "@/model/links/labels"
import { validateLinks } from "@/model/links/validate"

/**
 * Il pannello di un collegamento fra famiglie (spec 4a §7): il tipo, i due estremi, i problemi di quel
 * collegamento e il pulsante per eliminarlo. Nel 4a non c'è niente da modificare: il tipo è uno solo.
 * I problemi sono quelli del pannello Problemi filtrati sul collegamento; `validateLinks` basta, perché
 * nessun problema di famiglia ha un collegamento come obiettivo.
 */
export function LinkProperties({ linkId: id }: { linkId: string }) {
  const link = useStore(documentStore, (s) => s.doc.diagram.links[id])
  const doc = useStore(documentStore, (s) => s.doc)
  // Anche il problema sulla classe sorgente (`class-maps-multiple`, `node`) compare qui: aprendo uno
  // dei due collegamenti di una classe che ne ha troppi, si vede subito perché (F2, review finale).
  const issues = useMemo(() => validateLinks(doc).filter((i) => i.edge === id || i.node === link?.source), [doc, id, link?.source])
  if (!link) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-sm font-medium">{LINK_TITLE[link.kind]}</p>
      <p className="text-xs text-muted-foreground">
        {splitKey(link.source).key} → {splitKey(link.target).key}
      </p>
      {issues.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {issues.map((issue, i) => (
            <li key={i} className="flex gap-2">
              <span className={issue.severity === "error" ? "text-destructive" : "text-amber-500"}>{issue.severity === "error" ? "●" : "▲"}</span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" onClick={() => deleteSelection()}>Elimina collegamento</Button>
    </div>
  )
}
