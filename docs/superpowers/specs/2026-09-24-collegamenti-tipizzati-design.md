# Collegamenti tipizzati fra famiglie — design (step 4a)

Data: 2026-09-24
Branch: `feat/canvas-unificato`, dopo lo step 2a
Spec di riferimento: `2026-09-24-canvas-unificato-design.md` (§2: i collegamenti fra famiglie
sono fuori dal 2a; §4: `CanvasOps` e le chiavi con prefisso)
Sottosistema: una quarta parte del documento, i collegamenti, che attraversano le famiglie e
hanno regole proprie. Il primo tipo è classe → entità «mappa su».

## 1. Obiettivo

Nel 2a entità, classi e nodi di flusso convivono sullo stesso canvas, ma un arco esiste solo
dentro una famiglia. Lo step 4 aggiunge i **collegamenti tipizzati**, archi fra famiglie diverse
con un significato preciso e regole di validazione. Un collegamento non è un tratto a mano libera:
dice qualcosa che l'app può verificare.

Il lavoro è diviso così:

| Step | Contenuto | Stato |
|---|---|---|
| **4a** | **Infrastruttura dei collegamenti + classe → entità «mappa su»** | **questa spec** |
| 4b | flusso → entità «legge/scrive», flusso → classe «chiama» | spec a parte, riusa il 4a |
| 3 | la nota unica, ancorabile a qualunque elemento | spec a parte |

La nota ancorabile a tutto passa allo step 3 perché presuppone la nota unica. Farla qui vorrebbe
dire ancorare una delle due note di oggi, e poi rifare il lavoro.

«Mappa su» è il primo tipo per due motivi. È quello con le regole più ricche, quindi mette alla
prova l'infrastruttura. Ed è il caso d'uso più vicino a chi lavora con un ORM come Eloquent: la
classe è persistita in una tabella.

## 2. Confini

Il 4a **non** fa queste cose:

- **I collegamenti del flusso** («legge/scrive», «chiama»): arrivano nel 4b, sulla stessa
  infrastruttura.
- **La mappa esplicita attributo → colonna.** Attributi e colonne si abbinano per nome
  normalizzato (§5). Scegliere a mano la colonna di ogni attributo richiederebbe una UI e un
  modello in più, e il caso comune non ne ha bisogno.
- **La notazione testuale dei collegamenti.** DDL e Mermaid non hanno una notazione fra tipi di
  diagramma diversi, quindi i collegamenti restano fuori dall'export testo (§8).
- **Il layout che tiene conto dei collegamenti.** «Disponi» continua a ignorarli, come deciso nel
  2a (§7 di quella spec).
- **Controllo «colonna senza attributo».** È stato scartato nel brainstorming: con Eloquent i
  modelli di solito non dichiarano gli attributi, e il controllo segnalerebbe quasi ogni colonna.

## 3. Il modello

### La parte `links`

Accanto alle tre famiglie il documento ha una quarta parte, sempre presente:

```ts
diagram: {
  er, class, flow,
  links: Record<string, Link>
}

type Link = { kind: "maps-to"; source: string; target: string }
```

- La chiave è un uuid, come per le note e i nodi di flusso: un collegamento non ha un nome.
- `source` e `target` sono **chiavi con prefisso** (`class/Ordine`, `er/ordini`). È il solo punto
  in cui il prefisso entra nel modello, ed è corretto così: un collegamento attraversa le famiglie
  per definizione, e senza la famiglia la chiave sarebbe ambigua.
- `kind` è un'unione chiusa (`LinkKindSchema = z.enum(["maps-to"])`). Il 4b aggiunge i suoi tipi a
  questa unione.
- Lo schema zod controlla la **forma** di ogni collegamento: `maps-to` va da `class/…` a `er/…`.
  Il controllo si fa con una `refine` che confronta i prefissi. Non controlla che gli estremi
  esistano, perché un collegamento pendente è un problema di validazione (§5), non un file
  illeggibile.
- `createDocument` restituisce `links: {}`.

### Migrazione 3 → 4

`SCHEMA_VERSION` passa a 4. La migrazione aggiunge `links: {}` al `diagram` ed è una funzione pura
nella tabella `migrations`, come le precedenti.

## 4. Le chiavi e la coerenza

### Le chiavi sul canvas

Un collegamento è un arco, e la sua chiave sul canvas è `link/<uuid>`. `link` **non** è una
famiglia, ma un namespace a parte:

- `qualify`/`splitKey` restano per le sole famiglie, e `splitKey` continua a rifiutare tutto ciò
  che non è una famiglia;
- due funzioni nuove, `linkKey(id)` e `linkId(key)` (che restituisce `null` se la chiave non è un
  collegamento), stanno nello stesso modulo di `qualify` (`src/editor/families.ts`). Sono le sole
  che costruiscono o riconoscono una chiave di collegamento.

`CanvasOps` riconosce le chiavi `link/…` **prima** di chiamare `splitKey`:

| Metodo | Con i collegamenti |
|---|---|
| `edgesTouching(keys)` | aggiunge i collegamenti che toccano uno dei nodi dati |
| `edgeGeometry(key, a, b)` | su una chiave `link/…` usa la geometria dei collegamenti (§6) |
| `addEdge(source, target)` | fra famiglie diverse cerca un tipo di collegamento (§4, «Collega fra famiglie diverse») invece di restituire `null` |
| `deleteItems(nodes, edges)` | elimina i collegamenti fra gli archi, e quelli che toccano un nodo eliminato (§4, «Coerenza») |
| `validate()` | aggiunge i problemi dei collegamenti (§5) |

`nodeKeys`, `rectOf`, `addNode`, `duplicateNodes` e `commitDrag` non cambiano: un collegamento non
è un nodo.

### Coerenza

Un collegamento punta a una chiave, e nell'ER la chiave **è il nome** dell'entità. Rinomina ed
eliminazione devono quindi portarsi dietro i collegamenti, sempre **nella stessa recipe del
comando che li causa**: un solo passo di annulla, e nessuno stato intermedio incoerente.

| Evento | Effetto | Dove |
|---|---|---|
| Rinomina di un'entità o di una classe (cambia la chiave) | i collegamenti seguono la chiave nuova | `entity-rename.ts` e `class-rename.ts` compongono la recipe di rinomina con `retargetLinks(oldKey, newKey)` |
| Eliminazione di un nodo | spariscono i collegamenti che lo toccano | `CanvasOps.deleteItems` |
| Eliminazione di un collegamento | solo lui | `CanvasOps.deleteItems` |
| Duplicazione di nodi | i collegamenti non si duplicano | invariato, come per gli archi verso nodi non selezionati |

`retargetLinks(oldKey, newKey): Recipe` riceve chiavi con prefisso e sta in
`src/editor/links/commands.ts`. Le rinomine passano tutte dai due helper, sia dall'editor inline
sia dal pannello proprietà, quindi il punto di aggancio è uno solo per famiglia.

Come rete di sicurezza per un percorso dimenticato, la validazione segnala un collegamento pendente
come errore (§5). Il clic sull'errore lo seleziona, e lo si può eliminare.

### Collega fra famiglie diverse

`addEdge(source, target)` con due famiglie diverse consulta una tabella di regole,
`linkRule(sourceFamily, targetFamily)`, che per ogni coppia dice quale tipo nasce e in che verso:

| Coppia (in qualunque ordine) | Risultato |
|---|---|
| classe ↔ entità | `maps-to` da classe a entità: la direzione si normalizza, qualunque sia il verso del trascinamento |
| qualunque altra coppia | nessun tipo |

Casi di rifiuto, ognuno con un avviso nella barra, così il rifiuto non è più silenzioso:

- **Coppia senza tipo:** «Non esiste un collegamento fra un nodo di flusso e un'entità.» (con i
  nomi delle due famiglie). Nel 4b questa coppia avrà un tipo.
- **Interfaccia o enum verso un'entità:** «Un'interfaccia non si mappa su una tabella.» (o «Un
  enum…»). Solo gli stereotipi `class` e `abstract` possono avere «mappa su».
- **Collegamento già presente fra gli stessi due nodi:** nessun duplicato. Il gesto seleziona il
  collegamento esistente, senza avviso.

Una classe con due «mappa su» verso entità diverse si può creare: il problema lo segnala la
validazione (`class-maps-multiple`), perché un errore visibile è più chiaro di un gesto rifiutato.

Il tipo di `addEdge` cambia di conseguenza: restituisce un collegamento creato, un collegamento
esistente da selezionare, oppure un rifiuto con il suo messaggio. Il runner (`commit-connect`)
mostra il messaggio nella barra degli avvisi. Il tipo esatto lo fissa il piano.

## 5. Validazione

Un modulo nuovo del modello, `src/model/links/validate.ts`, legge il documento intero, perché gli
servono le due famiglie e i collegamenti. `CanvasOps.validate()` aggiunge i suoi problemi a quelli
delle famiglie.

| Codice | Gravità | Quando | Obiettivo del problema |
|---|---|---|---|
| `link-dangling` | errore | un estremo non esiste più | il collegamento (`edge: link/…`) |
| `class-maps-multiple` | errore | una classe è `source` di due o più `maps-to` | la classe (`node: class/…`) |
| `link-attribute-missing` | avviso | un attributo della classe non ha la colonna corrispondente | il collegamento |
| `link-type-mismatch` | avviso | attributo e colonna si abbinano, ma i tipi non sono compatibili | il collegamento |

Un collegamento pendente non produce anche gli avvisi sugli attributi: manca uno dei due lati da
confrontare.

### Abbinamento dei nomi

Un attributo e una colonna si abbinano se i loro nomi coincidono dopo aver messo tutto in minuscolo
e tolto ogni `_`. Quindi `createdAt`, `created_at` e `CreatedAt` sono lo stesso campo. Gli attributi
`static` sono esclusi: non sono colonne. Messaggio di `link-attribute-missing`:
`«Ordine.totale» non ha una colonna in «ordini»`.

### Compatibilità dei tipi

Entrambi i tipi si riducono a una **categoria**: intero, decimale, stringa, booleano, data/ora,
json, uuid. La tabella sta in `src/model/links/types.ts`.

- **Lato classe:** si tolgono `?` in testa e `|null`/`null|`, poi si confronta senza badare a
  maiuscole e minuscole.
  - `int`, `integer` → intero
  - `float`, `double`, `decimal` → decimale
  - `string` → stringa
  - `bool`, `boolean` → booleano
  - `DateTime`, `DateTimeImmutable`, `DateTimeInterface`, `Carbon`, `CarbonImmutable`, `date` → data/ora
  - `array`, `json` → json
  - `uuid` → uuid
- **Lato SQL:** si usa `baseType` (minuscole, niente parametri fra parentesi, niente `unsigned`).
  `baseType` si **sposta** da `src/io/emit/sql-types.ts` a `src/model/sql-type.ts`, perché il modello
  non può importare `io`; `sql-types.ts` la importa da lì. Ogni tipo SQL ammette un **insieme** di
  categorie:
  - `int`, `integer`, `bigint`, `smallint`, `mediumint`, `serial`, `bigserial`, `smallserial`,
    `int2`, `int4`, `int8` → intero
  - `tinyint` → intero **o booleano**: è il booleano di MySQL con Laravel
  - `decimal`, `numeric`, `real`, `double precision`, `double`, `float`, `float4`, `float8` → decimale
  - `varchar`, `character varying`, `char`, `character`, `text`, `mediumtext`, `longtext`,
    `tinytext`, `citext` → stringa
  - `boolean`, `bool` → booleano
  - `date`, `datetime`, `timestamp`, `timestamptz`, `timestamp with time zone`,
    `timestamp without time zone`, `time` → data/ora
  - `json`, `jsonb` → json **o stringa**
  - `uuid` → uuid **o stringa**
- **Regola:** avviso se la categoria della classe non è fra quelle della colonna. Se uno dei due
  tipi non è riconosciuto, o è vuoto, **non si avvisa**: un tipo personalizzato non deve produrre
  falsi allarmi.

Messaggio di `link-type-mismatch`: `«Ordine.totale: string» non è compatibile con «ordini.totale numeric»`.

## 6. Disegno

- **Layer:** `LinksLayer`, montato dopo gli archi delle famiglie e prima dei nodi. Gli archi fra
  famiglie stanno sopra quelli interni, ma sotto ogni nodo.
- **Geometria:** lo stesso instradamento ortogonale degli archi (`routeEdge` + `pathFromPoints` di
  `src/editor/edge-routing.ts`), con scarto 0. Due collegamenti fra gli stessi due nodi non possono
  esistere (§4, «Collega fra famiglie diverse»), quindi non serve un fascio.
- **Stile:** tratteggiato, colore `var(--muted-foreground)`, freccia aperta verso l'entità,
  etichetta «mappa su» sul primo segmento, come le etichette del flusso.
- **Anteprima del drag:** la vista usa gli stessi attributi degli archi (`data-edge-id`,
  `data-edge-hit`, `data-edge-line`, `data-edge-target`, `data-edge-label`), e `edgesTouching`
  include i collegamenti. Quindi `previewDrag` li aggiorna senza codice nuovo.
- **Vista pura e vista connessa**, sulla forma degli archi esistenti: la pura serve anche a
  `buildSvg`.

## 7. Pannello e interazione

- **Selezione:** un clic su un collegamento lo seleziona come un arco (`edge:link/<uuid>`).
  `PropertiesPanel` riconosce la chiave con `linkId` prima di `splitKey`.
- **Pannello del collegamento:** mostra «Mappa su», la riga `Ordine → ordini` con i nomi delle due
  estremità, i problemi di quel collegamento (lo stesso elenco del pannello Problemi, filtrato) e il
  pulsante «Elimina collegamento». Nel 4a non c'è niente da modificare: il tipo è uno solo.
- **Tastiera:** Canc elimina il collegamento selezionato, come ogni arco.
- **Doppio clic:** su un collegamento non apre niente.

## 8. Export

- **SVG e PNG:** i collegamenti ci sono, nello stesso ordine del canvas: corsie, archi di famiglia,
  collegamenti, nodi.
- **Export testo:** DDL e Mermaid non includono i collegamenti. Se il documento ne ha, il dialogo
  lo dice in una riga: «I collegamenti fra famiglie non hanno una notazione in questo formato.»
- **File `.dd.json`:** i collegamenti sono nella parte `links`.

## 9. Test

**Unit:**
- Migrazione 3 → 4 (un documento v3 prende `links: {}`), e il documento v2 della catena 2 → 3 → 4.
- Schema: un `maps-to` da entità a classe, o da classe a classe, viene rifiutato.
- `linkKey`/`linkId` si invertono; `linkId` restituisce `null` su una chiave di famiglia.
- `CanvasOps`:
  - `addEdge` classe → entità ed entità → classe danno lo stesso collegamento;
  - rifiuto con messaggio per una coppia senza tipo, per un'interfaccia e per un enum;
  - un secondo collegamento fra gli stessi nodi seleziona quello esistente;
  - `deleteItems` di un'entità elimina anche il collegamento, in un solo passo di annulla;
  - `edgesTouching` include i collegamenti.
- Rinomina: rinominare l'entità (e la classe) porta con sé il collegamento, con un solo passo di
  annulla; dopo l'annulla il collegamento torna alla chiave vecchia.
- Validazione, un test per ogni regola, più: `created_at`/`createdAt`; attributo `static` escluso;
  `tinyint` con `bool`; `?int` e `int|null`; tipo sconosciuto senza avviso; collegamento pendente
  senza avvisi sugli attributi.
- `baseType` spostato: i test di `sql-types` restano verdi senza modifiche.

**E2E:** uno scenario nuovo, `collegamenti.mjs`:
1. un'entità `ordini` con una colonna `totale` e una classe `Ordine` con `totale` e `note`;
2. Collega classe → entità: compare il collegamento, e il pannello Problemi dice che `Ordine.note`
   non ha una colonna;
3. rinomina dell'entità: il collegamento resta attaccato;
4. salva, ricarica: il collegamento c'è ancora;
5. elimina il collegamento con Canc;
6. Collega fra un'interfaccia e l'entità: compare l'avviso, e nessun collegamento.

## 10. Limiti che il 4a accetta

- L'abbinamento per nome non gestisce un attributo che corrisponde a una colonna con un nome
  diverso (per esempio `$casts` o accessor di Eloquent): servirebbe la mappa esplicita, esclusa al
  §2.
- La tabella dei tipi è approssimata per natura. Un tipo non riconosciuto non avvisa, quindi può
  sfuggire un'incompatibilità vera su tipi insoliti.
- «Disponi» può allontanare una classe dalla sua tabella, perché mette le famiglie in blocchi
  separati. Da rivalutare quando i collegamenti del 4b renderanno il caso frequente.

## 11. Decisioni prese nel brainstorming

| Domanda | Scelta | Scartato |
|---|---|---|
| Catalogo dei collegamenti | mappa su, legge/scrive, chiama, nota ancorabile | — |
| Come dividere il lavoro | 4a infrastruttura + mappa su; 4b i due del flusso; nota nello step 3 | tutto insieme; la nota qui |
| Regole di «mappa su» | attributo senza colonna, tipi incompatibili, una classe una tabella | colonna senza attributo (rumorosa con Eloquent) |
| Abbinamento dei nomi | snake_case ↔ camelCase, maiuscole ignorate | nome identico; mappa esplicita |
| Dove vive un collegamento | parte `links` del documento, estremi con prefisso | dentro una delle due famiglie |
| Chiave sul canvas | namespace `link/`, separato dalle famiglie | `link` come quarta famiglia |
| Coerenza con rinomina ed eliminazione | nella stessa recipe del comando che la causa | un riallineamento dopo ogni dispatch (non conosce la chiave nuova) |
