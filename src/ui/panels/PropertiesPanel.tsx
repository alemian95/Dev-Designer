import { ArrowDown, ArrowUp, Plus, X } from "lucide-react"
import { useStore } from "zustand"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { addAttribute, moveAttribute, removeAttribute, setCollapsed, updateAttribute, updateRelationship } from "@/editor/commands/er"
import { documentStore, type Recipe } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { selectedKeys, sessionStore } from "@/editor/session-store"
import { CardinalitySchema, type Attribute, type Cardinality } from "@/model/er/schema"
import { renameEntityWithNotice } from "../entity-rename"
import { CommitInput } from "./CommitInput"

const dispatch = (recipe: Recipe | null) => {
  if (recipe) documentStore.getState().dispatch(recipe)
}

const CARDINALITY_LABEL: Record<Cardinality, string> = {
  one: "1 (uno)",
  "zero-or-one": "0..1 (zero o uno)",
  many: "1..* (uno o molti)",
  "zero-or-many": "0..* (zero o molti)",
}

function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function AttributeRow({ entity, index, attribute, count }: { entity: string; index: number; attribute: Attribute; count: number }) {
  const patch = (p: Partial<Attribute>) => dispatch(updateAttribute(entity, index, p))
  return (
    <li className="flex flex-col gap-1 rounded border p-2">
      <div className="flex gap-1">
        <CommitInput key={attribute.name} value={attribute.name} onCommit={(name) => patch({ name })} aria-label="Nome attributo" className="h-7 text-xs" />
        <CommitInput key={`t-${attribute.type}`} value={attribute.type} onCommit={(type) => patch({ type })} aria-label="Tipo" className="h-7 text-xs" />
      </div>
      <div className="flex items-center gap-2">
        <Flag label="PK" checked={attribute.primaryKey} onChange={(primaryKey) => patch({ primaryKey })} />
        <Flag label="FK" checked={attribute.foreignKey} onChange={(foreignKey) => patch({ foreignKey })} />
        <Flag label="NULL" checked={attribute.nullable} onChange={(nullable) => patch({ nullable })} />
        <Flag label="UNIQUE" checked={attribute.unique} onChange={(unique) => patch({ unique })} />
        <span className="ml-auto flex">
          <Button variant="ghost" size="icon" className="size-6" disabled={index === 0} aria-label="Sposta su" onClick={() => dispatch(moveAttribute(entity, index, index - 1))}><ArrowUp /></Button>
          <Button variant="ghost" size="icon" className="size-6" disabled={index === count - 1} aria-label="Sposta giù" onClick={() => dispatch(moveAttribute(entity, index, index + 1))}><ArrowDown /></Button>
          <Button variant="ghost" size="icon" className="size-6" aria-label="Rimuovi" onClick={() => dispatch(removeAttribute(entity, index))}><X /></Button>
        </span>
      </div>
    </li>
  )
}

function EntityProperties({ entityKey: key }: { entityKey: string }) {
  const entity = useStore(documentStore, (s) => erDiagram(s.doc).model.entities[key])
  const view = useStore(documentStore, (s) => erDiagram(s.doc).view.nodes[key])
  if (!entity || !view) return null
  const rename = (name: string, schema: string | undefined) => renameEntityWithNotice(key, name, schema)
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="grid gap-1">
        <Label htmlFor="entity-name">Nome</Label>
        <CommitInput key={entity.name} id="entity-name" value={entity.name} onCommit={(name) => rename(name, entity.schema)} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="entity-schema">Schema</Label>
        <CommitInput key={entity.schema ?? ""} id="entity-schema" value={entity.schema ?? ""} onCommit={(schema) => rename(entity.name, schema)} placeholder="(nessuno)" />
      </div>
      <Flag label="Collassata" checked={view.collapsed} onChange={(v) => dispatch(setCollapsed(key, v))} />
      <div className="flex items-center justify-between">
        <Label>Attributi</Label>
        <Button variant="outline" size="sm" onClick={() => dispatch(addAttribute(key))}><Plus /> Aggiungi</Button>
      </div>
      <ul className="flex flex-col gap-2">
        {entity.attributes.map((a, i) => (
          <AttributeRow key={i} entity={key} index={i} attribute={a} count={entity.attributes.length} />
        ))}
      </ul>
    </div>
  )
}

function CardinalitySelect({ id, value, onChange }: { id: string; value: Cardinality; onChange: (v: Cardinality) => void }) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(CardinalitySchema.parse(e.target.value))} className="h-8 rounded-md border bg-background px-2 text-sm">
      {CardinalitySchema.options.map((c) => <option key={c} value={c}>{CARDINALITY_LABEL[c]}</option>)}
    </select>
  )
}

function RelationshipProperties({ relationshipKey: key }: { relationshipKey: string }) {
  const rel = useStore(documentStore, (s) => erDiagram(s.doc).model.relationships[key])
  if (!rel) return null
  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">{rel.source.entity} → {rel.target.entity}</p>
      <div className="grid gap-1">
        <Label htmlFor="rel-name">Nome</Label>
        <CommitInput key={rel.name ?? ""} id="rel-name" value={rel.name ?? ""} onCommit={(name) => dispatch(updateRelationship(key, (r) => { r.name = name.trim() || undefined }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-source">Cardinalità lato {rel.source.entity}</Label>
        <CardinalitySelect id="rel-source" value={rel.source.cardinality} onChange={(c) => dispatch(updateRelationship(key, (r) => { r.source.cardinality = c }))} />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="rel-target">Cardinalità lato {rel.target.entity}</Label>
        <CardinalitySelect id="rel-target" value={rel.target.cardinality} onChange={(c) => dispatch(updateRelationship(key, (r) => { r.target.cardinality = c }))} />
      </div>
      <Flag label="Identificante" checked={rel.identifying} onChange={(v) => dispatch(updateRelationship(key, (r) => { r.identifying = v }))} />
    </div>
  )
}

export function PropertiesPanel() {
  const selection = useStore(sessionStore, (s) => s.selection)
  const entities = selectedKeys(selection, "node")
  const relationships = selectedKeys(selection, "edge")
  if (entities.length === 1 && relationships.length === 0) return <EntityProperties key={entities[0]} entityKey={entities[0]!} />
  if (relationships.length === 1 && entities.length === 0) return <RelationshipProperties key={relationships[0]} relationshipKey={relationships[0]!} />
  return (
    <p className="p-3 text-sm text-muted-foreground">
      {selection.size === 0 ? "Seleziona un'entità o una relazione." : `${selection.size} elementi selezionati`}
    </p>
  )
}
