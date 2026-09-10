import { useStore } from "zustand"
import { Label } from "@/components/ui/label"
import { setStereotype, updateRelation } from "@/editor/class/commands"
import { classDiagram } from "@/editor/class-access"
import { setCollapsed } from "@/editor/commands/view"
import { documentStore, type Recipe } from "@/editor/document-store"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { RelationKindSchema, StereotypeSchema, type RelationKind, type Stereotype } from "@/model/class/schema"
import { renameClassWithNotice } from "@/ui/class-rename"
import { CommitInput } from "@/ui/panels/CommitInput"

const dispatch = (recipe: Recipe | null) => {
  if (recipe) documentStore.getState().dispatch(recipe)
}

/** Stessa forma del `Flag` di `kinds/er.tsx`: un checkbox con etichetta, niente di più. */
function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

const STEREOTYPE_LABEL: Record<Stereotype, string> = {
  class: "Classe",
  interface: "Interfaccia",
  abstract: "Astratta",
  enum: "Enum",
}

const RELATION_LABEL: Record<RelationKind, string> = {
  association: "Associazione",
  generalization: "Generalizzazione",
  realization: "Realizzazione",
  composition: "Composizione",
  aggregation: "Aggregazione",
  dependency: "Dipendenza",
}

function StereotypeSelect({ id, value, onChange }: { id: string; value: Stereotype; onChange: (v: Stereotype) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(StereotypeSchema.parse(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm">
      {StereotypeSchema.options.map((s) => <option key={s} value={s}>{STEREOTYPE_LABEL[s]}</option>)}
    </select>
  )
}

function RelationKindSelect({ id, value, onChange }: { id: string; value: RelationKind; onChange: (v: RelationKind) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(RelationKindSchema.parse(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm">
      {RelationKindSchema.options.map((k) => <option key={k} value={k}>{RELATION_LABEL[k]}</option>)}
    </select>
  )
}

function ClassNodeProperties({ classKey: key }: { classKey: string }) {
  const cls = useStore(documentStore, (s) => classDiagram(s.doc).model.classes[key])
  const view = useStore(documentStore, (s) => classDiagram(s.doc).view.nodes[key])
  if (!cls || !view) return null
  const count = cls.attributes.length + cls.methods.length
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1">
        <Label htmlFor="class-name">Nome</Label>
        <CommitInput key={cls.name} id="class-name" value={cls.name} onCommit={(name) => renameClassWithNotice(key, name)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="class-stereotype">Stereotipo</Label>
        <StereotypeSelect id="class-stereotype" value={cls.stereotype} onChange={(stereotype) => dispatch(setStereotype(key, stereotype))} />
      </div>
      <Flag label="Collassata" checked={view.collapsed} onChange={(v) => dispatch(setCollapsed(key, v))} />
      <div className="grid gap-1">
        <Label>Membri</Label>
        {/* Sola lettura, deliberatamente: nessuna riga di form per membro (§10 della spec). */}
        <p className="text-sm text-muted-foreground">{count} {count === 1 ? "membro" : "membri"}</p>
        <p className="text-xs text-muted-foreground">Doppio click sul corpo per modificarli.</p>
      </div>
    </div>
  )
}

function RelationProperties({ relationKey: key }: { relationKey: string }) {
  const rel = useStore(documentStore, (s) => classDiagram(s.doc).model.relations[key])
  if (!rel) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">{rel.source.class} → {rel.target.class}</p>
      <div className="grid gap-1">
        <Label htmlFor="rel-kind">Tipo</Label>
        <RelationKindSelect id="rel-kind" value={rel.kind} onChange={(kind) => dispatch(updateRelation(key, (r) => { r.kind = kind }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-name">Nome</Label>
        <CommitInput key={rel.name ?? ""} id="rel-name" value={rel.name ?? ""} onCommit={(name) => dispatch(updateRelation(key, (r) => { r.name = name.trim() || undefined }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-source-mult">Molteplicità lato {rel.source.class}</Label>
        <CommitInput key={rel.source.multiplicity} id="rel-source-mult" value={rel.source.multiplicity} onCommit={(v) => dispatch(updateRelation(key, (r) => { r.source.multiplicity = v.trim() }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-source-role">Ruolo lato {rel.source.class}</Label>
        <CommitInput key={rel.source.role} id="rel-source-role" value={rel.source.role} onCommit={(v) => dispatch(updateRelation(key, (r) => { r.source.role = v.trim() }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-target-mult">Molteplicità lato {rel.target.class}</Label>
        <CommitInput key={rel.target.multiplicity} id="rel-target-mult" value={rel.target.multiplicity} onCommit={(v) => dispatch(updateRelation(key, (r) => { r.target.multiplicity = v.trim() }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-target-role">Ruolo lato {rel.target.class}</Label>
        <CommitInput key={rel.target.role} id="rel-target-role" value={rel.target.role} onCommit={(v) => dispatch(updateRelation(key, (r) => { r.target.role = v.trim() }))} />
      </div>
    </div>
  )
}

/**
 * Corpo del pannello proprietà per il class diagram, stessa forma di quello dell'ER
 * (`kinds/er.tsx`): la cornice (`PropertiesPanel`) monta questo componente solo quando la
 * selezione è esattamente una classe o esattamente una relazione, e qui basta distinguere quale
 * delle due. Nessuna riga di form per membro, deliberatamente: sarebbe la ricostruzione
 * dell'alternativa scartata nel brainstorming (§15 della spec), e due editor per lo stesso dato
 * divergerebbero.
 */
export function ClassProperties() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const classes = selectedKeys(selection, "node")
  if (classes.length === 1) return <ClassNodeProperties key={classes[0]} classKey={classes[0]!} />
  const relations = selectedKeys(selection, "edge")
  return <RelationProperties key={relations[0]} relationKey={relations[0]!} />
}
