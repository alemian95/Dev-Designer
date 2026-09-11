export type IssueCode =
  // ER
  | "entity-without-pk" | "duplicate-attribute" | "fk-without-relationship"
  | "dangling-relationship" | "entity-name-clash"
  // class (i codici arrivano nel Task 10; dichiararli già qui evita di
  // riaprire questo file, e una union chiusa dà l'esaustività a tsc)
  | "class-name-clash" | "duplicate-member" | "dangling-relation"
  | "generalization-cycle" | "abstract-method-in-concrete-class"

export type IssueSeverity = "error" | "warning"

export interface Issue {
  code: IssueCode
  severity: IssueSeverity
  message: string
  /** Chiave del nodo coinvolto, se c'è. */
  node?: string
  /** Chiave dell'arco coinvolto, se c'è. */
  edge?: string
}
