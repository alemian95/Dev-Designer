import * as z from "zod"
import { inFamily, type Family } from "../family"
import { Identifier } from "../shared"

/** I tipi di collegamento fra famiglie: «mappa su» (4a), l'accesso e la chiamata del flusso (4b). */
export const LinkKindSchema = z.enum(["maps-to", "accesses", "calls"])
export type LinkKind = z.infer<typeof LinkKindSchema>

/**
 * Il modo di un accesso. Fra un nodo di flusso e un'entità c'è un solo accesso, qualunque cosa il
 * nodo ne faccia: il modo lo dice, e si cambia dal pannello (spec 4b §3).
 */
export const AccessModeSchema = z.enum(["read", "write", "read-write"])
export type AccessMode = z.infer<typeof AccessModeSchema>

/**
 * Le famiglie agli estremi di ogni tipo, nel verso del tipo: la sola definizione. La usano lo schema,
 * per rifiutare un file con gli estremi sbagliati, e `linkRule`, per il gesto Collega.
 */
export const LINK_ENDS: Readonly<Record<LinkKind, { source: Family; target: Family }>> = {
  "maps-to": { source: "class", target: "er" },
  accesses: { source: "flow", target: "er" },
  calls: { source: "flow", target: "class" },
}

const ends = { source: Identifier, target: Identifier }

/**
 * Un collegamento: gli estremi sono chiavi **con prefisso** (`class/Ordine`, `er/ordini`), il solo
 * punto in cui il prefisso entra nel modello, perché un collegamento attraversa le famiglie per
 * definizione. Un'unione discriminata su `kind`, perché solo l'accesso ha il modo. Lo schema controlla
 * la forma, non che gli estremi esistano: un collegamento pendente è un problema di validazione
 * (`links/validate.ts`), non un file illeggibile.
 */
export const LinkSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("maps-to"), ...ends }),
    z.object({ kind: z.literal("accesses"), ...ends, mode: AccessModeSchema }),
    z.object({ kind: z.literal("calls"), ...ends }),
  ])
  .refine((l) => inFamily(l.source, LINK_ENDS[l.kind].source) && inFamily(l.target, LINK_ENDS[l.kind].target), {
    message: "gli estremi del collegamento non appartengono alle famiglie del suo tipo",
  })
export type Link = z.infer<typeof LinkSchema>

/** La parte `links` del documento, per id (uuid): un collegamento non ha un nome. */
export const LinksSchema = z.record(z.string(), LinkSchema)

/**
 * Il tipo di collegamento che nasce fra due famiglie, in qualunque ordine, e se il gesto va
 * rovesciato per rispettarne il verso. `null`: la coppia non ha un tipo.
 */
export function linkRule(from: Family, to: Family): { kind: LinkKind; reversed: boolean } | null {
  for (const kind of LinkKindSchema.options) {
    const ends = LINK_ENDS[kind]
    if (ends.source === from && ends.target === to) return { kind, reversed: false }
    if (ends.source === to && ends.target === from) return { kind, reversed: true }
  }
  return null
}
