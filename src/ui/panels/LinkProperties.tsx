import { useMemo } from "react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { deleteSelection } from "@/editor/actions"
import { documentStore } from "@/editor/document-store"
import { setLinkMode } from "@/editor/links/commands"
import { ACCESS_MODE_LABEL, LINK_TITLE, endName } from "@/model/links/labels"
import { AccessModeSchema } from "@/model/links/schema"
import { validateLinks } from "@/model/links/validate"

/**
 * Il pannello di un collegamento fra famiglie (spec 4a §7, 4b §8): il tipo, i due estremi con i loro
 * nomi leggibili, per un accesso la select del modo, i problemi di quel collegamento e il pulsante
 * per eliminarlo. I problemi sono quelli del pannello Problemi filtrati sul collegamento;
 * `validateLinks` basta, perché nessun problema di famiglia ha un collegamento come obiettivo.
 */
export function LinkProperties({ linkId: id }: { linkId: string }) {
  const link = useStore(documentStore, (s) => s.doc.diagram.links[id])
  const doc = useStore(documentStore, (s) => s.doc)
  // Anche il problema sulla classe sorgente (`class-maps-multiple`, `node`) compare qui: aprendo uno
  // dei due collegamenti di una classe che ne ha troppi, si vede subito perché (F2, review finale 4a).
  const issues = useMemo(() => validateLinks(doc).filter((i) => i.edge === id || i.node === link?.source), [doc, id, link?.source])
  if (!link) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-sm font-medium">{LINK_TITLE[link.kind]}</p>
      <p className="text-xs text-muted-foreground">
        {endName(doc, link.source)} → {endName(doc, link.target)}
      </p>
      {link.kind === "accesses" && (
        <div className="grid gap-1">
          <Label htmlFor="link-mode">Modo</Label>
          <select
            id="link-mode"
            value={link.mode}
            onChange={(e) => documentStore.getState().dispatch(setLinkMode(id, AccessModeSchema.parse(e.target.value)))}
            className="h-8 rounded-md border bg-background px-2 text-sm"
          >
            {AccessModeSchema.options.map((m) => <option key={m} value={m}>{ACCESS_MODE_LABEL[m]}</option>)}
          </select>
        </div>
      )}
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
