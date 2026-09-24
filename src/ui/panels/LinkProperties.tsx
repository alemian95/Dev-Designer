import { useMemo } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { deleteSelection } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { splitKey } from "@/editor/families"
import { validateLinks } from "@/model/links/validate"
import { LINK_LABEL } from "@/ui/canvas/LinkEdge"

/**
 * Il pannello di un collegamento fra famiglie (spec 4a §7): il tipo, i due estremi, i problemi di quel
 * collegamento e il pulsante per eliminarlo. Nel 4a non c'è niente da modificare: il tipo è uno solo.
 * I problemi sono quelli del pannello Problemi filtrati sul collegamento; `validateLinks` basta, perché
 * nessun problema di famiglia ha un collegamento come obiettivo.
 */
export function LinkProperties({ linkId: id }: { linkId: string }) {
  const link = useStore(documentStore, (s) => s.doc.diagram.links[id])
  const doc = useStore(documentStore, (s) => s.doc)
  const issues = useMemo(() => validateLinks(doc).filter((i) => i.edge === id), [doc, id])
  if (!link) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-sm font-medium first-letter:uppercase">{LINK_LABEL[link.kind]}</p>
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
