import { useMemo } from "react"
import { useStore } from "zustand"
import { documentStore } from "@/editor/document-store"
import { opsFor } from "@/editor/kinds/ops"
import { selId, sessionStore } from "@/editor/session-store"
import type { Issue } from "@/model/issue"

function select(issue: Issue) {
  if (issue.node) sessionStore.getState().setSelection([selId("node", issue.node)])
  else if (issue.edge) sessionStore.getState().setSelection([selId("edge", issue.edge)])
}

/** Validazione live: ricalcolata quando cambia il documento, non a ogni render. */
export function IssuesPanel() {
  const doc = useStore(documentStore, (s) => s.doc)
  const issues = useMemo(() => opsFor(doc).validate(), [doc])
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
