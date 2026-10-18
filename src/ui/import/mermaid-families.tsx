import type { ReactNode } from "react"
import { classDiagram } from "@/editor/class-access"
import {
  classImportFates, erImportFates, importMermaidClass, importMermaidEr, importMermaidFlow, placeClassImport, placeErImport,
  placeFlowImport, rekeyFlowKeys, rekeyFlowNotes, selectClassFragment, selectErFragment, type ImportFate,
} from "@/editor/commands/import-mermaid"
import type { Recipe } from "@/editor/document-store"
import { erDiagram } from "@/editor/er-access"
import { flowDiagram } from "@/editor/flow-access"
import { noteDiagram } from "@/editor/note-access"
import type { MermaidReadyOf } from "@/io/mermaid/analyse"
import type { FragmentByFamily, ImportFamily } from "@/io/mermaid/formats"
import type { DevDocument } from "@/model/document"
import type { LayoutGraph, LayoutPositions } from "@/model/layout"

/** Relazioni (o archi), note e pool presenti nella famiglia: la differenza prima/dopo il dispatch dice quanti ne sono entrati davvero. */
export interface Tally { relations: number; notes: number; pools: number }

type Layout = (g: LayoutGraph) => Promise<LayoutPositions>

/** Tutto ciò che il dialog sa di una famiglia di import: una famiglia nuova è una voce di `FAMILY_IMPORTS`. */
export interface FamilyImport<F extends ImportFamily> {
  noun: string
  /** L'esito di ogni elemento con la casella. */
  fates(doc: DevDocument, fr: FragmentByFamily[F]): Record<string, ImportFate>
  /** Quanti elementi entrano col pulsante. */
  importable(fr: FragmentByFamily[F], chosen: ReadonlySet<string>): number
  /** Selezione, disposizione e comando: ciò che resta da fare è il dispatch. */
  prepare(
    doc: DevDocument, fr: FragmentByFamily[F], chosen: ReadonlySet<string>, layout: Layout,
  ): Promise<{ recipe: Recipe; elements: number; fallback: string | null }>
  /** I conteggi del riepilogo, prima dell'import. */
  summary(fr: FragmentByFamily[F]): string
  tally(doc: DevDocument): Tally
  report(elements: number, delta: Tally): ReactNode
}

export const FAMILY_IMPORTS: { [F in ImportFamily]: FamilyImport<F> } = {
  er: {
    noun: "entità",
    fates: (doc, fr) => erImportFates(doc, fr.entities, new Set(fr.referenced)),
    importable: (_fr, chosen) => chosen.size,
    async prepare(doc, fr, chosen, layout) {
      const present = new Set(Object.keys(erDiagram(doc).model.entities))
      const { entities, relationships } = selectErFragment(fr.entities, fr.relationships, chosen, present)
      const { positions, fallback } = await placeErImport(doc, entities, relationships, layout)
      return { recipe: importMermaidEr(entities, relationships, positions), elements: Object.keys(entities).length, fallback }
    },
    summary: (fr) => `${Object.keys(fr.entities).length} entità, ${fr.relationships.length} relazioni`,
    tally: (doc) => ({ relations: Object.keys(erDiagram(doc).model.relationships).length, notes: 0, pools: 0 }),
    report: (elements, { relations }) => (
      <>Importate <strong>{elements}</strong> entità e <strong>{relations}</strong> relazioni.</>
    ),
  },
  class: {
    noun: "classi",
    fates: (doc, fr) => classImportFates(doc, fr.classes, new Set(fr.referenced)),
    importable: (_fr, chosen) => chosen.size,
    async prepare(doc, fr, chosen, layout) {
      const present = new Set(Object.keys(classDiagram(doc).model.classes))
      const fragment = selectClassFragment(fr.classes, fr.relations, fr.notes, chosen, present)
      const placement = await placeClassImport(doc, fragment, layout)
      return { recipe: importMermaidClass(fragment, placement), elements: Object.keys(fragment.classes).length, fallback: placement.fallback }
    },
    summary: (fr) => `${Object.keys(fr.classes).length} classi, ${fr.relations.length} relazioni, ${fr.notes.length} note`,
    tally: (doc) => ({
      relations: Object.keys(classDiagram(doc).model.relations).length,
      notes: Object.keys(noteDiagram(doc).model.notes).length,
      pools: 0,
    }),
    report: (elements, { relations, notes }) => (
      <>Importate <strong>{elements}</strong> classi e <strong>{relations}</strong> relazioni, con <strong>{notes}</strong> note.</>
    ),
  },
  flow: {
    noun: "nodi",
    // Il flowchart non ha caselle: si aggiunge sempre, intero (spec §7).
    fates: () => ({}),
    // Un flowchart di soli subgraph vuoti non si importa.
    importable: (fr) => Object.keys(fr.model.nodes).length,
    async prepare(doc, fr, _chosen, layout) {
      const { model, keys } = rekeyFlowKeys(fr.model)
      const notes = rekeyFlowNotes(fr.notes, keys)
      const placement = await placeFlowImport(doc, model, layout, notes)
      return { recipe: importMermaidFlow(model, placement, notes), elements: Object.keys(model.nodes).length, fallback: placement.fallback }
    },
    // Le note solo se ci sono: i testi del flowchart restano quelli di prima.
    summary: ({ model: { nodes, edges, pools }, notes }) =>
      `${Object.keys(nodes).length} nodi, ${Object.keys(edges).length} archi, ${Object.keys(pools).length} pool` +
      (notes.length > 0 ? `, ${notes.length} note` : ""),
    tally(doc) {
      const { model } = flowDiagram(doc)
      return { relations: Object.keys(model.edges).length, notes: Object.keys(noteDiagram(doc).model.notes).length, pools: Object.keys(model.pools).length }
    },
    report: (elements, { relations, pools, notes }) => notes > 0
      ? <>Importati <strong>{elements}</strong> nodi e <strong>{relations}</strong> archi, con <strong>{pools}</strong> pool e <strong>{notes}</strong> note.</>
      : <>Importati <strong>{elements}</strong> nodi e <strong>{relations}</strong> archi, con <strong>{pools}</strong> pool.</>,
  },
}

/** Una voce di `FAMILY_IMPORTS` legata al suo frammento: il dialog non vede né famiglia né frammento. */
export interface BoundImport {
  noun: string
  fates(doc: DevDocument): Record<string, ImportFate>
  importable(chosen: ReadonlySet<string>): number
  prepare(doc: DevDocument, chosen: ReadonlySet<string>, layout: Layout): ReturnType<FamilyImport<ImportFamily>["prepare"]>
  summary(): string
  tally(doc: DevDocument): Tally
  report(elements: number, delta: Tally): ReactNode
}

/** L'unica funzione generica in `F` che il dialog chiama: `ready.kind` sceglie la voce, `ready.fragment` ne è il frammento. */
export function bindImport<F extends ImportFamily>(ready: MermaidReadyOf<F>): BoundImport {
  const entry: FamilyImport<F> = FAMILY_IMPORTS[ready.kind]
  const { fragment } = ready
  return {
    noun: entry.noun,
    fates: (doc) => entry.fates(doc, fragment),
    importable: (chosen) => entry.importable(fragment, chosen),
    prepare: (doc, chosen, layout) => entry.prepare(doc, fragment, chosen, layout),
    summary: () => entry.summary(fragment),
    tally: entry.tally,
    report: entry.report,
  }
}
