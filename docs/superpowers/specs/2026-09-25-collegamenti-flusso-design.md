# Collegamenti del flusso — design (step 4b)

Data: 2026-09-25
Branch: `feat/collegamenti-flusso`, da `master` (`6608f5b`)
Spec di riferimento: `2026-09-24-collegamenti-tipizzati-design.md` (4a: la parte `links`, le chiavi
`link/…`, il gesto Collega fra famiglie, `LinksLayer`, il pannello del collegamento)
Sottosistema: due tipi nuovi sulla stessa infrastruttura. Un nodo di flusso **accede** a
un'entità (legge, scrive, legge e scrive) e **chiama** una classe.

## 1. Obiettivo

Il 4a ha costruito i collegamenti tipizzati e il primo tipo, classe → entità «mappa su». Il 4b
aggiunge i due tipi che partono dal flowchart, così un diagramma misto dice quale passo di un
processo tocca quale tabella e quale servizio:

| Tipo | Da | A | Etichetta sul canvas |
|---|---|---|---|
| `accesses` | nodo di flusso | entità | «legge», «scrive» o «legge e scrive», secondo il modo |
| `calls` | nodo di flusso | classe | «chiama» |

Lo scopo, deciso nel brainstorming, è **documentare**: i due tipi si disegnano, si selezionano,
seguono rinomine ed eliminazioni, ma non hanno regole di validazione proprie oltre al collegamento
pendente.

## 2. Confini

Il 4b **non** fa queste cose:

- **Il metodo chiamato.** «Chiama» collega il nodo alla classe, non a un metodo preciso. Scegliere
  il metodo richiederebbe un campo in più, una UI per sceglierlo e una regola per quando il metodo
  sparisce, e lo scopo è documentare.
- **Controlli sugli accessi**, come «tabella letta ma mai scritta». Scartati nel brainstorming.
- **Forme del flusso ammesse o escluse**, salvo la nota (§4): anche inizio/fine e decisione possono
  avere collegamenti.
- **Il layout che tiene conto dei collegamenti**, come nel 4a (§10 di quella spec).

## 3. Il modello

### I due tipi

`LinkKindSchema` diventa `z.enum(["maps-to", "accesses", "calls"])`, e `LINK_ENDS`, la sola
definizione delle famiglie agli estremi, guadagna due righe:

| Tipo | `source` | `target` |
|---|---|---|
| `maps-to` | `class` | `er` |
| `accesses` | `flow` | `er` |
| `calls` | `flow` | `class` |

`accesses` ha un campo in più, il modo:

```ts
type AccessMode = "read" | "write" | "read-write"

type Link =
  | { kind: "maps-to"; source: string; target: string }
  | { kind: "accesses"; source: string; target: string; mode: AccessMode }
  | { kind: "calls"; source: string; target: string }
```

- `LinkSchema` diventa un'**unione discriminata** su `kind` (`z.discriminatedUnion`), perché solo
  `accesses` ha `mode`. La `refine` sugli estremi resta una sola, applicata all'unione, e legge
  ancora `LINK_ENDS[kind]`.
- Un modo sconosciuto, o un `accesses` senza modo, rende il file illeggibile: è la forma, non un
  problema di validazione.

### Etichette

Le etichette servono al canvas, al pannello **e** ai messaggi di validazione, che stanno nel
modello. Quindi si spostano da `src/ui/canvas/link-label.ts` a `src/model/links/labels.ts`, che
diventa la sola fonte:

- `linkLabel(link): string`: l'etichetta sul canvas e nei messaggi. `maps-to` → «mappa su»,
  `calls` → «chiama», `accesses` → «legge», «scrive» o «legge e scrive» secondo il modo.
- `LINK_TITLE: Record<LinkKind, string>`: il titolo del pannello. «Mappa su», «Accesso»,
  «Chiama». Per l'accesso il titolo non dipende dal modo, così non cambia mentre lo si modifica.
- `ACCESS_MODE_LABEL: Record<AccessMode, string>`: le voci della select del modo. «Legge»,
  «Scrive», «Legge e scrive».

`src/ui/canvas/link-label.ts` si elimina: `LinkEdge.tsx` e `LinkProperties.tsx` importano dal
modello.

### Versione 5

`SCHEMA_VERSION` passa da 4 a 5, con una migrazione **che non cambia niente**: un file v4 è già un
file v5 valido. La versione cambia comunque, perché master è pubblicato: un'app ferma al 4a che apre
un file con `accesses` deve dire «schemaVersion 5 più recente di quella supportata (4)» invece di
rifiutarlo con un errore di schema che non spiega niente.

## 4. Il gesto Collega

`linkRule` scorre già `LINK_ENDS`, quindi trova da solo i due tipi nuovi, e normalizza il verso:

| Coppia (in qualunque ordine) | Nasce |
|---|---|
| nodo di flusso ↔ entità | `accesses` da nodo a entità, con `mode: "read"` |
| nodo di flusso ↔ classe | `calls` da nodo a classe, verso qualunque stereotipo |
| classe ↔ entità | `maps-to`, come nel 4a |

`calls` accetta anche interfacce ed enum: in PHP entrambi possono avere metodi.

Rifiuti nuovi, con l'avviso nella barra come nel 4a (lo strumento resta attivo):

- una **nota del flusso** (forma `note`) verso un'entità: «Una nota non legge né scrive una tabella.»
- una **nota del flusso** verso una classe: «Una nota non chiama una classe.»
- un nodo di flusso verso una **nota del class diagram**: «Una nota non si chiama.»

Il controllo della nota del flusso guarda la forma del nodo `source` (già normalizzato); quello
della nota di classe guarda che il `target` sia una classe.

Un collegamento già presente fra gli stessi due nodi, dello stesso tipo, si seleziona e non si
duplica, come nel 4a. Per `accesses` il confronto ignora il modo: fra un nodo e un'entità esiste un
solo accesso, e il modo si cambia dal pannello.

Il messaggio «Non esiste un collegamento fra … e ….» non compare più per nessuna coppia di famiglie
diverse, perché ogni coppia ha ora un tipo. Il codice resta, per il giorno in cui arriva una
famiglia nuova.

## 5. Coerenza

Non serve codice nuovo:

- le chiavi dei nodi di flusso sono uuid e non cambiano mai;
- la rinomina di entità e classi passa già da `followRename` → `retargetLinks`, che sposta
  `source` e `target` di **qualunque** collegamento;
- l'eliminazione di un nodo, di qualunque famiglia, elimina già i collegamenti che lo toccano
  (`CanvasOps.deleteItems` con `linksTouching`), nella stessa recipe.

I test del §9 fissano questi comportamenti per i tipi nuovi.

## 6. Il comando nuovo

`setLinkMode(id, mode): Recipe` in `src/editor/links/commands.ts`. Cambia il modo di un `accesses`.
Su un id che non c'è, su un collegamento di un altro tipo o con lo stesso modo non scrive niente,
quindi `dispatch` non registra un passo di annulla.

## 7. Validazione

Nessun codice di problema nuovo. `validateLinks` passa da «ogni collegamento è un `maps-to`» a un
controllo per tipo:

- **Tutti i tipi:** se un estremo non esiste più, `link-dangling`. Il messaggio diventa generico:
  `Il collegamento «${linkLabel(link)}» fra «${A}» e «${B}» punta a un elemento che non esiste più`.
- **`maps-to`:** le regole del 4a, invariate (`class-maps-multiple`, `link-unmappable`,
  `link-attribute-missing`, `link-type-mismatch`).
- **`accesses` e `calls`:** nient'altro.

### Nomi degli estremi

Una funzione del modello, `endName(doc, key): string`, dà il nome leggibile di un estremo. È la sola
fonte per i messaggi di validazione e per la riga degli estremi nel pannello:

| Famiglia | Nome |
|---|---|
| `er`, `class` | la chiave senza prefisso (il nome dell'entità o della classe) |
| `flow`, nodo esistente con etichetta | l'etichetta del nodo |
| `flow`, nodo esistente senza etichetta | «(senza etichetta)» |
| `flow`, nodo che non esiste più | «(nodo eliminato)» |

Il messaggio di `link-dangling` di un `maps-to` resta quindi quello del 4a:
`Il collegamento «mappa su» fra «Ordine» e «ordini» punta a un elemento che non esiste più`.

## 8. Disegno, pannello, export

- **Canvas.** Nessun layer nuovo: `LinksLayer` e `LinkEdgeView` disegnano già ogni collegamento.
  L'etichetta sul primo segmento passa da `LINK_LABEL[link.kind]` a `linkLabel(link)`. Stesso
  tratteggio e stessa freccia aperta verso il target per tutti i tipi: a distinguerli è
  l'etichetta.
- **Pannello del collegamento:**
  - il titolo è `LINK_TITLE[link.kind]`;
  - la riga degli estremi usa `endName`: `Calcola totale → ordini`;
  - **solo per `accesses`**, una select «Modo» con le voci di `ACCESS_MODE_LABEL`, che fa dispatch
    di `setLinkMode`;
  - poi, come nel 4a, i problemi del collegamento e il pulsante «Elimina collegamento».
- **Export.** SVG e PNG includono i tipi nuovi senza codice in più. La nota dell'export testo («I
  collegamenti fra famiglie non hanno una notazione in questo formato.») vale anche per loro.

## 9. Test

**Unit:**
- Schema: `accesses` con ognuno dei tre modi è accettato; un modo sconosciuto, un `accesses` senza
  modo, un `accesses` da `class/…` e un `calls` verso `er/…` sono rifiutati.
- Migrazione 4 → 5: un documento v4 con un `maps-to` passa intatto, alla versione 5.
- `linkRule`: flusso ↔ entità dà `accesses`, flusso ↔ classe dà `calls`, in entrambi i versi.
- `connectAcross`:
  - nodo → entità ed entità → nodo danno lo stesso `accesses`, con modo `read`;
  - nodo → classe e classe → nodo danno lo stesso `calls`, anche verso un'interfaccia;
  - i tre rifiuti delle note, con i loro testi esatti;
  - un secondo gesto fra gli stessi nodi seleziona il collegamento esistente, anche dopo che il
    modo è stato cambiato.
- `setLinkMode`: cambia il modo, e l'annulla lo riporta indietro; lo stesso modo, un id che non c'è
  o un `calls` non scrivono niente.
- `linkLabel`, `LINK_TITLE`, `ACCESS_MODE_LABEL`: un valore per ogni tipo e modo.
- `endName`: i quattro casi della tabella del §7.
- `validateLinks`: un `accesses` e un `calls` validi non hanno problemi; con il nodo di flusso
  eliminato a mano sono `link-dangling` con «(nodo eliminato)» nel messaggio; i test del 4a restano
  verdi senza modifiche.
- Coerenza: eliminare un nodo di flusso con `deleteItems` elimina i suoi collegamenti in un solo
  passo di annulla; rinominare un'entità sposta il `target` di un `accesses`.
- Pannello: un `accesses` selezionato mostra «Accesso», `Calcola totale → ordini` e la select;
  cambiare il modo aggiorna il documento. Un `calls` mostra «Chiama» e nessuna select.

**E2E:** si estende `collegamenti.mjs` con quattro passi:
1. un nodo processo «Calcola totale», collegato all'entità: nasce un collegamento con «legge»;
2. dal pannello il modo diventa «Scrive», e l'etichetta sul canvas diventa «scrive»;
3. lo stesso processo collegato a una classe: nasce «chiama»;
4. una nota del flusso verso l'entità: compare «Una nota non legge né scrive una tabella.», e
   nessun collegamento.

## 10. Limiti che il 4b accetta

- «Chiama» non dice quale metodo: un nodo che chiama due metodi della stessa classe ha un solo
  collegamento (§2).
- «Disponi» continua a ignorare i collegamenti, e mette le famiglie in blocchi separati: un flusso
  può finire lontano dalle sue tabelle. Con il 4b il caso è più frequente; resta da rivalutare.
- Tutti i tipi hanno lo stesso tratteggio: si distinguono solo dall'etichetta.

## 11. Decisioni prese nel brainstorming

| Domanda | Scelta | Scartato |
|---|---|---|
| Cosa verifica l'app | solo il collegamento pendente: lo scopo è documentare | metodo chiamato, tabelle mai scritte, forme ammesse |
| Lettura e scrittura | un tipo `accesses` con un modo, cambiato dal pannello | due tipi separati (due linee sovrapposte); il verso della freccia (non esprime «legge e scrive») |
| Versione del file | 5, con una migrazione che non cambia niente | restare alla 4 (un'app vecchia rifiuterebbe il file senza spiegare perché) |
| Dove stanno le etichette | nel modello, perché servono anche ai messaggi di validazione | in `ui/canvas` come nel 4a |
| Stereotipi ammessi da «chiama» | tutti | solo `class` e `abstract` |
