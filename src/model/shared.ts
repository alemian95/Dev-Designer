import * as z from "zod"

/** Versione del formato su disco. Incrementare insieme a una migrazione in migrations.ts. */
export const SCHEMA_VERSION = 10

export const Identifier = z.string().min(1)

export const NodeViewSchema = z.object({ x: z.number(), y: z.number(), collapsed: z.boolean() })
export type NodeView = z.infer<typeof NodeViewSchema>

/** Un lato scelto a mano: positivo, o `null` finché il nodo segue la misura del suo contenuto. */
export const ChosenSideSchema = z.number().positive().nullable()

/**
 * La view di un nodo che si ridimensiona dagli spigoli: la misura scelta a mano è un minimo, sopra
 * quella che il contenuto chiede. Assente (i file fino alla versione 9) vale `null`. La usano tutte
 * le famiglie tranne le forme, che hanno `w`/`h` obbligatori dalla loro nascita.
 */
export const SizedNodeViewSchema = NodeViewSchema.extend({ w: ChosenSideSchema.optional(), h: ChosenSideSchema.optional() })
export type SizedNodeView = z.infer<typeof SizedNodeViewSchema>

/** Della view, ciò che conta per la misura di un nodo: la misura scelta e, per chi lo ha, il collasso. */
export interface ChosenSize {
  w?: number | null
  h?: number | null
  collapsed?: boolean
}

/**
 * La misura di un nodo: quella del contenuto, allargata a quella scelta a mano. Un nodo collassato
 * mostra il solo header, e tiene l'altezza del contenuto.
 */
export function chosenSize(content: { w: number; h: number }, view: ChosenSize): { w: number; h: number } {
  return { w: Math.max(content.w, view.w ?? 0), h: view.collapsed ? content.h : Math.max(content.h, view.h ?? 0) }
}

/**
 * I 16 punti di aggancio di un nodo (spec agganci §3): tre per lato a ¼, ½ e ¾, contati in senso
 * orario lungo il perimetro (`n1` è il più vicino a `nw`, `e1` a `ne`, `s1` a `se`, `w1` a `sw`), e i
 * quattro spigoli.
 */
export const AnchorSchema = z.enum(["n1", "n2", "n3", "e1", "e2", "e3", "s1", "s2", "s3", "w1", "w2", "w3", "nw", "ne", "se", "sw"])
export type Anchor = z.infer<typeof AnchorSchema>

/** Gli agganci dei due capi di un arco: `null` è il capo automatico, che sceglie il lato da sé. */
export const EdgeAnchorsSchema = z.object({ source: AnchorSchema.nullable(), target: AnchorSchema.nullable() })
export type EdgeAnchors = z.infer<typeof EdgeAnchorsSchema>

export const AUTO_ANCHORS: EdgeAnchors = { source: null, target: null }

/**
 * Gli agganci di un arco di qualunque famiglia. Il campo è facoltativo — assente vale due capi
 * automatici — sul precedente di `navigable` (`class/schema.ts`): un `.default()` lo renderebbe
 * obbligatorio nel tipo, e ogni punto che costruisce un arco andrebbe toccato (spec §3).
 */
export function anchorsOf(edge: { anchors?: EdgeAnchors }): EdgeAnchors {
  return edge.anchors ?? AUTO_ANCHORS
}

/** Scrive gli agganci su un arco, e toglie il campo quando tornano entrambi automatici. */
export function writeAnchors(edge: { anchors?: EdgeAnchors }, anchors: EdgeAnchors): void {
  if (anchors.source === null && anchors.target === null) delete edge.anchors
  else edge.anchors = { source: anchors.source, target: anchors.target }
}
