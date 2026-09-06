import { useMemo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { selId, sessionStore } from "@/editor/session-store"
import { validateEr, type Issue } from "@/model/er/validate"

function select(issue: Issue) {
  if (issue.entity) sessionStore.getState().setSelection([selId("entity", issue.entity)])
  else if (issue.relationship) sessionStore.getState().setSelection([selId("relationship", issue.relationship)])
}

/** Validazione live: ricalcolata quando cambia il model, non a ogni render. */
export function IssuesPanel() {
  const model = useStore(documentStore, (s) => erDiagram(s.doc).model)
  const issues = useMemo(() => validateEr(model), [model])
  return (
    <section className="border-t">
      <h2 className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">Problemi ({issues.length})</h2>
      {issues.length === 0 ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">Nessun problema.</p>
      ) : (
        <ul className="max-h-64 overflow-auto">
          {issues.map((issue, i) => (
            <li key={i}>
              <button type="button" onClick={() => select(issue)} className="flex w-full gap-2 px-3 py-1 text-left text-xs hover:bg-accent">
                <span className={issue.severity === "error" ? "text-destructive" : "text-amber-500"}>{issue.severity === "error" ? "●" : "▲"}</span>
                <span>{issue.message}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
