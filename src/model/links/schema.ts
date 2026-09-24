import * as z from "zod"
import { inFamily, type Family } from "../family"
import { Identifier } from "../shared"

/** I tipi di collegamento fra famiglie. Lo step 4b aggiunge i suoi a questa unione. */
export const LinkKindSchema = z.enum(["maps-to"])
export type LinkKind = z.infer<typeof LinkKindSchema>

/**
 * Le famiglie agli estremi di ogni tipo, nel verso del tipo: la sola definizione. La usano lo schema,
 * per rifiutare un file con gli estremi sbagliati, e `linkRule`, per il gesto Collega.
 */
export const LINK_ENDS: Readonly<Record<LinkKind, { source: Family; target: Family }>> = {
  "maps-to": { source: "class", target: "er" },
}

/**
 * Un collegamento: gli estremi sono chiavi **con prefisso** (`class/Ordine`, `er/ordini`), il solo
 * punto in cui il prefisso entra nel modello, perché un collegamento attraversa le famiglie per
 * definizione. Lo schema controlla la forma, non che gli estremi esistano: un collegamento pendente
 * è un problema di validazione (`links/validate.ts`), non un file illeggibile.
 */
export const LinkSchema = z
  .object({ kind: LinkKindSchema, source: Identifier, target: Identifier })
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
