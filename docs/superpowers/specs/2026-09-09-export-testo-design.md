# Export testo — design

Data: 2026-09-09
Spec di riferimento: `docs/superpowers/specs/2026-09-06-dev-designer-design.md` (§2, punto 1
dell'ordine di consegna: «Shell + ER completo … export DDL e Mermaid»)
Sottosistema: `io/emit` più un dialog in `ui`. Il PlantUML resta fuori: nella
spec madre appartiene al class diagram, che non esiste ancora.

## 1. Obiettivo

Tirare fuori dal diagramma il testo che serve a un dev: il DDL dello schema nei
due dialetti che l'import già legge, e il Mermaid da incollare in un README o
in una PR.

Chiude il giro aperto dall'import. Oggi si può portare dentro un `pg_dump` e
non si può portare fuori nulla: il diagramma è un visualizzatore. Con l'export
diventa uno strumento di refactoring dello schema, e l'import esistente diventa
il collaudo migliore che ci sia — `dump → modello → DDL → riparse → confronto`.

## 2. Confini: cosa il modello non sa

Il DDL emesso è **strutturale**, e non per pigrizia: sono informazioni che il
modello non contiene. `AttributeSchema` ha nome, tipo, `primaryKey`,
`foreignKey`, `nullable`, `unique` e nient'altro (`src/model/document.ts`).

Restano fuori perché non esistono da nessuna parte nel documento: `DEFAULT`,
`CHECK`, indici non-unici, `ON DELETE` / `ON UPDATE`, `AUTO_INCREMENT` e
`IDENTITY`, commenti di colonna, collation, storage engine, e i vincoli
`UNIQUE` su più colonne — questi ultimi l'import li scarta già con un avviso
esplicito (`map.ts`), quindi non sono mai entrati.

Un dump reale che entra ed esce **non è identico** all'originale. È una
proprietà del modello, non un difetto dell'export, e va detta all'utente:
l'avviso finale del dialog lo dice in una riga.

Il modello inoltre **non registra il dialetto d'origine**. `AttributeSchema.type`
è una stringa libera «nel dialetto d'origine» e nulla dice quale sia. Questo
vincola tutta la §9.

## 3. Architettura

Tre emettitori puri nello strato `io`, nessuno dei quali tocca il DOM:

```
src/io/emit/
  ddl.ts          emettitore unico, i due dialetti sono un oggetto descrittore
  sql-types.ts    normalizzazione del tipo + i due insiemi di tipi noti
  mermaid.ts      erDiagram
```

Il layer è imposto da `no-restricted-imports` (`eslint.config.js`): `io` può
vedere `model` e `editor`, non `ui`. Gli emettitori vedono solo `model`.

### Perché un emettitore DDL solo, e non due come i parser

L'ADR 0001 tiene `pg.ts` e `mysql.ts` **deliberatamente non fattorizzati**: i
due AST sono incompatibili e le funzioni omonime divergerebbero, quindi
unificarle peggiorerebbe il codice.

Qui il caso è simmetrico, non contrario. I due emettitori camminerebbero sulla
**stessa** `ErModel` e differirebbero per due cose: il carattere di citazione e
l'insieme dei tipi noti. Scriverli separati significherebbe duplicare per intero
la generazione di `CREATE TABLE`, dei vincoli e degli `ALTER TABLE`, cioè quasi
tutto il file. È la stessa regola dell'ADR 0001 applicata a un input diverso —
fattorizza ciò che è davvero comune, non ciò che si somiglia — e va scritta in un
**ADR 0005**, altrimenti la prossima persona la legge come un'incoerenza.

Un terzo dialetto costa un descrittore e un insieme di tipi.

## 4. Contratto

```ts
export interface EmitResult {
  text: string
  /** Messaggi per l'utente, già aggregati. Non uno per colonna. */
  warnings: string[]
}

export function emitDdl(model: ErModel, dialect: Dialect): EmitResult
export function emitMermaid(model: ErModel): EmitResult
```

`Dialect` è già `"postgres" | "mysql"` in `src/io/ddl/schema.ts` e si riusa: è
lo stesso concetto, e l'export lo importa da lì invece di dichiararne un gemello.

Funzioni pure: nessuna lettura dello store, nessun `document`, nessun `await`.
Il modello arriva come parametro. Questo le rende testabili per intero in node,
che è il vincolo forte del progetto — non c'è jsdom.

L'ordine dell'uscita è **deterministico**: le entità in ordine alfabetico di
chiave, le relazioni in ordine alfabetico di chiave, gli attributi nell'ordine
del modello (che è quello che l'utente vede e riordina sul canvas). Due export
dello stesso documento danno due file identici byte per byte, altrimenti
diffare due export diventa inutile.

## 5. DDL: forma dell'uscita

```sql
-- Dev Designer — schema "Magazzino"
-- Il modello non rappresenta DEFAULT, CHECK, indici, ON DELETE e UNIQUE su più
-- colonne: questo DDL descrive tabelle, colonne, chiavi e riferimenti.

CREATE SCHEMA IF NOT EXISTS "pub";

CREATE TABLE "ordini" (
  "id" integer NOT NULL,
  "utente_id" integer,
  PRIMARY KEY ("id")
);

CREATE TABLE "pub"."utenti" (
  "id" integer NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  PRIMARY KEY ("id")
);

ALTER TABLE "ordini"
  ADD CONSTRAINT "ordini_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "pub"."utenti" ("id");
```

Regole, valide per entrambi i dialetti:

- **`CREATE SCHEMA IF NOT EXISTS`** per ogni valore distinto di `entity.schema`,
  in testa al file. Senza, il DDL non gira su un database vuoto. In MySQL
  `SCHEMA` è sinonimo di `DATABASE`, quindi la stessa riga vale.
- **Nessun `DROP`.** Un export non distrugge dati di chi lo esegue.
- **`NOT NULL`** su `nullable: false`. Niente su `nullable: true`: è il default.
- **`UNIQUE` inline** sulla colonna, perché il modello ha solo l'`unique` di
  colonna singola. Nessun `ADD CONSTRAINT` separato da inventare.
- **`PRIMARY KEY (…)` come vincolo di tabella**, non inline sulla colonna: regge
  la chiave composta senza un secondo percorso di codice, e l'ordine è quello
  degli attributi nel modello.
- **FK in `ALTER TABLE` separati**, dopo tutte le `CREATE TABLE`. Nessun
  ordinamento topologico da calcolare e i riferimenti circolari funzionano.
- Uno schema **non** viene emesso davanti a una tabella che non ne ha.

Il dialetto MySQL cambia solo il carattere di citazione (`` ` ``) e l'insieme
dei tipi noti. Nient'altro: le tre forme sopra sono valide in entrambi.

## 6. DDL: citazione e sfuggimento

**Ogni identificatore è citato, sempre.** Nomi di tabella, schema, colonna e
vincolo. Regge parole riservate, maiuscole significative in Postgres, e il punto
dentro un nome — che questo progetto ammette di proposito (`entityKey` usa il
punto come separatore ma non lo vieta dentro un nome).

Lo schema e il nome si leggono dai campi `entity.schema` ed `entity.name`, **non
spezzando `entityKey` sul primo punto**: `map.ts` documenta già perché quella
scorciatoia è sbagliata.

**Il valore dentro i delimitatori va sfuggito**, e questa non è una precauzione
teorica: il nome di una relazione lo digita l'utente in un campo di testo e può
contenere qualunque cosa. Postgres raddoppia `"`, MySQL raddoppia `` ` ``.

```ts
const quote = (dialect: Dialect, name: string): string =>
  dialect === "postgres" ? `"${name.replaceAll('"', '""')}"` : `\`${name.replaceAll("`", "``")}\``
```

È la lezione dell'export SVG, dove `--font-mono` con le doppie virgolette
chiudeva l'attributo e produceva un file malformato **solo in produzione**,
applicata prima invece che dopo. Ha un test con il carattere di citazione dentro
un nome di entità, di colonna e di relazione.

Il **tipo non è un identificatore e non si cita**: si scrive verbatim (§9).

## 7. DDL: nomi dei vincoli

`relationship.name` se c'è, altrimenti generato come
`<tabella>_<colonne separate da _>_fkey` — la convenzione di Postgres, leggibile
anche in MySQL.

I nomi generati **si deduplicano**: si tiene un `Set` e a una collisione si
appende `_2`, `_3`, … MySQL pretende nomi di vincolo unici per **database**, non
per tabella, quindi due tabelle con la stessa colonna FK verso la stessa
destinazione collidono. Un nome dato dall'utente che collide viene deduplicato
allo stesso modo, con un avviso: cambiare il nome silenziosamente è peggio.

## 8. DDL: i tre casi che il modello permette e il DDL no

| Caso nel modello | Uscita | Avviso |
|---|---|---|
| Entità senza attributi | `-- tabella "x": nessuna colonna definita nel diagramma` al posto del `CREATE TABLE` | sì, con l'elenco dei nomi |
| Relazione con `attributes: []` su un estremo | `-- relazione "a" → "b": colonne non definite nel diagramma` | sì, aggregato per numero |
| Entità referenziata senza `primaryKey` | tabella e `ALTER TABLE` emessi comunque | sì: in MySQL l'`ALTER` fallirà, manca l'indice sulle colonne referenziate |

`CREATE TABLE x ()` non è valido in nessuno dei due dialetti: un file che non
gira è peggio di un file con un commento al posto di una tabella.

Le relazioni con `attributes: []` sono quelle disegnate a mano (ADR 0003): non
hanno colonne, quindi non esiste una `FOREIGN KEY` da scrivere. Il commento è
preferibile al silenzio perché il DDL esportato è un file che un dev finisce a
mano, e l'informazione resta dov'è utile invece di sparire in un avviso che si
chiude e non torna più. Il commento nomina le due entità e si colloca fra gli
`ALTER TABLE`, dove starebbe il vincolo.

Un estremo che punta a un'entità inesistente (`dangling`, che `validateEr` già
segnala come errore) viene saltato con un avviso: nessun `ALTER TABLE` verso il
nulla.

## 9. Tipi: verbatim, con un avviso preciso

Il tipo emesso è **la stringa del modello, intatta**. Nessuna tabella di
conversione: il modello non sa da quale dialetto viene il tipo, quindi ogni
traduzione sarebbe un'euristica su un indovinello, e le traduzioni plausibili
cambiano la semantica di nascosto — `serial` → `int auto_increment` non è la
stessa cosa, `jsonb` → `json` perde l'indicizzabilità.

### Il predicato dell'avviso

Non «il tipo non è nell'insieme del target», che griderebbe al lupo su ogni
`enum`, `domain` o `citext`: sono tipi personalizzati, sconosciuti al nostro
elenco e **validi** in Postgres, e un export Postgres→Postgres li segnalerebbe
tutti. Il predicato è più stretto:

> si avvisa quando il tipo normalizzato appartiene all'insieme dell'**altro**
> dialetto e **non** a quello del target.

Zero falsi positivi sui tipi personalizzati — di quelli non sappiamo nulla e non
diciamo nulla — e coglie esattamente i casi che rompono: `jsonb`, `timestamptz`,
`bytea`, `character varying` verso MySQL; `longtext`, `mediumint`, `datetime`,
`enum` verso Postgres.

Limite noto e accettato: `serial` esiste in **entrambi** i dialetti con
semantiche diverse (in MySQL è `BIGINT UNSIGNED NOT NULL AUTO_INCREMENT`), e
quindi non produce avviso. Coerente con la scelta di non tradurre la semantica.

L'avviso è **aggregato**: `3 tipi non appartengono a MySQL: jsonb, timestamptz,
bytea`. Una riga per colonna su un dump da 80 tabelle è illeggibile.

### Normalizzazione, solo per il confronto

`baseType(type)`: minuscolo, `trim`, via ogni `(…)`, via un `[]` finale
ripetuto, via le parole `unsigned` e `zerofill`, spazi interni collassati a uno.

| Ingresso | Normalizzato |
|---|---|
| `VARCHAR(255)` | `varchar` |
| `numeric(10,2)` | `numeric` |
| `bigint(20) unsigned` | `bigint` |
| `character varying(255)` | `character varying` |
| `timestamp(3) with time zone` | `timestamp with time zone` |
| `text[]` | `text` |
| `double precision` | `double precision` |

I tipi a più parole sono la ragione per cui non si tronca al primo spazio.

**Attenzione a quali forme arrivano davvero nel modello.** I due adapter
normalizzano già in import: `pg.ts` restituisce `varchar(255)` per
`character varying(255)` e `timestamptz` per `timestamp with time zone`
(asserito in `pg.test.ts`), `mysql.ts` ricompone `bigint(20) unsigned` e
`bigint unsigned` (`mysql.test.ts`). Le forme con spazio che il modello contiene
per davvero sono quindi `double precision` e i modificatori MySQL; le altre
righe della tabella restano valide perché l'utente può digitare qualunque cosa
nel pannello proprietà, ma non è da loro che nasce il caso.

### Insieme Postgres

Da Table 8.1 di `postgresql.org/docs/current/datatype.html`, nomi e alias:

`bigint`, `int8`, `bigserial`, `serial8`, `bit`, `bit varying`, `varbit`,
`boolean`, `bool`, `box`, `bytea`, `character`, `char`, `character varying`,
`varchar`, `cidr`, `circle`, `date`, `double precision`, `float`, `float8`,
`inet`, `integer`, `int`, `int4`, `interval`, `json`, `jsonb`, `line`, `lseg`,
`macaddr`, `macaddr8`, `money`, `numeric`, `decimal`, `path`, `pg_lsn`,
`pg_snapshot`, `point`, `polygon`, `real`, `float4`, `smallint`, `int2`,
`smallserial`, `serial2`, `serial`, `serial4`, `text`, `time`,
`time with time zone`, `time without time zone`, `timetz`, `timestamp`,
`timestamp with time zone`, `timestamp without time zone`, `timestamptz`,
`tsquery`, `tsvector`, `txid_snapshot`, `uuid`, `xml`

### Insieme MySQL

Da `dev.mysql.com/doc/refman/8.4/en/data-types.html`, sinonimi compresi:

`integer`, `int`, `smallint`, `tinyint`, `mediumint`, `bigint`, `decimal`,
`dec`, `numeric`, `fixed`, `float`, `double`, `double precision`, `real`,
`bit`, `bool`, `boolean`, `serial`, `date`, `datetime`, `timestamp`, `time`,
`year`, `char`, `varchar`, `binary`, `varbinary`, `blob`, `tinyblob`,
`mediumblob`, `longblob`, `text`, `tinytext`, `mediumtext`, `longtext`,
`enum`, `set`, `json`, `geometry`, `point`, `linestring`, `polygon`,
`multipoint`, `multilinestring`, `multipolygon`, `geometrycollection`

## 10. Mermaid: forma dell'uscita

```
erDiagram
  "pub.utenti" |o..o{ "ordini" : ""
  "ordini" {
    integer id PK
    integer utente_id FK
  }
  "pub.utenti" {
    integer id PK
    varchar(255) email UK
    `double precision` saldo
  }
```

Le regole vengono dalla **grammatica**
(`packages/mermaid/src/diagrams/er/parser/erDiagram.jison` su `develop`), non
dalla pagina di documentazione, che su due punti dice meno o dice altro:

- La pagina afferma che i tipi ammettono «cifre, trattini, underscore,
  parentesi e parentesi quadre». `ATTRIBUTE_WORD` è
  `([\*A-Za-z_\u00C0-\uFFFF][A-Za-z0-9\-\_\[\]\(\)\.,\u00C0-\uFFFF\*]*)`: **la
  virgola e il punto ci sono**, quindi `numeric(10,2)` passa. **Lo spazio no**,
  e il caso è reale: dei tipi con spazio che arrivano davvero nel modello (§9)
  `double precision` e `bigint(20) unsigned` sono asseriti nei test degli
  adapter. Emessi grezzi darebbero Mermaid non valido.
- La via d'uscita è nella grammatica e non nella prosa: dentro un blocco entità
  il lexer entra nello stato `block_bq` su un backtick (``<block>[`]``), accetta
  ``[^`]+`` come `ATTRIBUTE_WORD` e i backtick **non** entrano nel token. Quindi
  `` `bigint(20) unsigned` `` emette esattamente quel tipo.
- L'etichetta vuota `: ""` la pagina non la mostra; la grammatica l'accetta
  (`\"[^"]*\"`).

Regole di emissione:

- **Tipo fra backtick solo quando serve**, cioè quando contiene un carattere
  fuori da `ATTRIBUTE_WORD`. Sempre backtick sarebbe una diramazione in meno,
  ma renderebbe brutta l'uscita normale — e qui l'uscita **è** il prodotto.
  Un backtick dentro il tipo si rimuove, con avviso: non c'è modo di sfuggirlo
  dentro `block_bq`.
- Ordine: prima la riga di relazione, poi i blocchi entità. Le entità senza
  attributi producono un blocco vuoto `{ }`, che Mermaid disegna: nessun caso
  degenere, al contrario del DDL.
- Chiavi `PK`, `FK`, `UK` separate da virgola, combinabili.
- **La nullabilità non viene emessa.** Mermaid ER ha solo PK/FK/UK; il `?` sul
  tipo che la documentazione cita non compare in `ATTRIBUTE_WORD`, e non ci si
  appoggia a qualcosa che non si è potuto verificare. `NOT NULL` vive nel DDL,
  che è il posto giusto.
- Nessun commento `%%` di intestazione: `%` è illegale dentro un nome di entità
  citato e la pagina dell'ER non documenta `%%`; l'intestazione starebbe fuori
  dal blocco ma non aggiunge nulla che valga il rischio.

## 11. Mermaid: citazione dei nomi

**Nome di entità sempre citato.** `ENTITY_NAME` è `\"[^"%\r\n\v\b\\]+\"`: la
forma citata accetta tutto tranne `"`, `%`, i ritorni a capo, il backspace e il
backslash. Quei caratteri si sostituiscono con `_` e si avvisa. Citare sempre
evita di decidere caso per caso e fa passare `pub.utenti` con il punto.

Il **nome di attributo** segue la stessa regola del tipo: backtick quando
contiene un carattere fuori da `ATTRIBUTE_WORD`.

## 12. Mermaid: cardinalità

Il marcatore sta accanto all'entità che descrive. Si scrive il **padre**
(`relationship.target`, il lato referenziato) a sinistra e il **figlio**
(`relationship.source`, il lato della FK) a destra, che è il verso in cui la
riga si legge.

| `Cardinality` | forma sinistra | forma destra |
|---|---|---|
| `one` | `\|\|` | `\|\|` |
| `zero-or-one` | `\|o` | `o\|` |
| `many` | `}\|` | `\|{` |
| `zero-or-many` | `}o` | `o{` |

`identifying: true` → `--` (linea continua), `false` → `..` (tratteggiata),
come da documentazione Mermaid. Etichetta: `relationship.name`, o `""`.

## 13. UI: il dialog

Una voce di menu in `DocumentMenu.tsx`, **`Esporta testo…`**, sotto le due voci
immagine. Come SVG e PNG **non** è disabilitata in sola lettura: esportare è una
lettura.

`src/ui/export/TextExportDialog.tsx`, stesso pattern di `ImportDdlDialog.tsx`.
`dialog.tsx` e `toggle-group.tsx` sono già fra i componenti: nessuna dipendenza
nuova.

Dentro:

- un `ToggleGroup` a tre valori: **PostgreSQL**, **MySQL**, **Mermaid**;
- l'anteprima in un `<pre>` scrollabile, `font-mono`, sola lettura;
- l'elenco degli avvisi sopra l'anteprima, con la riga fissa sui limiti del
  modello (§2);
- i bottoni **Copia** e **Scarica**.

Il ricalcolo al cambio di formato è una funzione pura su un modello già in
memoria: si fa nel render, senza stato asincrono e senza `useEffect`. Se su un
diagramma grande si sentisse, si misura e si mette in `useMemo` — non prima.

**Copia**: `navigator.clipboard.writeText`. Il rifiuto (contesto non sicuro,
permesso negato) diventa un `notice` tramite `documentSession.patch`, come già
fa la rinomina rifiutata. **Scarica**: `download()` di `io/file.ts`, che dopo
l'export immagini accetta già `Blob | string`. Estensioni `.sql` e `.mmd`,
`text/plain;charset=utf-8` per entrambi.

`fileName()` è oggi privata in `src/ui/export/actions.ts` e serve a due
chiamanti veri: si estrae in `src/ui/export/file-name.ts`. Due chiamanti sono
duplicazione, non astrazione prematura.

Nessun caricamento pigro: gli emettitori sono stringhe pure e il dialog è un
componente come gli altri. Ma **si misura il bundle prima e dopo**, e se cresce
in modo apprezzabile si fa come per l'export immagini, dove `react-dom/server`
gonfiava l'index del 37% e la misura — non l'intuizione — l'ha rivelato.

## 14. Test

Tutto unitario in Vitest: le funzioni sono pure e il progetto non ha jsdom.

**Il test che conta, round-trip:** fixture `.sql` sintetica →
`parse` (`pg.ts` / `mysql.ts`) → `mapToEr` → `emitDdl` → **riparse** →
confronto dei `SqlTable[]` normalizzati. Chiude il cerchio con il parser che già
esiste, e prova in un colpo la citazione, i tipi, le PK, gli UNIQUE e le FK.

Il confronto è sui campi che il modello **sa** rappresentare: nomi, tipi,
`nullable`, `primaryKey`, `unique` di colonna singola, FK. Non su ciò che la §2
dichiara perduto, altrimenti il test asserirebbe il contrario della spec.

Solo le fixture **sintetiche** committate (`spike/fixtures/*.synthetic.sql`) e
snippet inline con nomi inventati. I dump reali dell'utente sono git-ignored e
nessun frammento — nomi di tabella e di colonna compresi — entra in un test.

`sql-types.test.ts`: la tabella di normalizzazione della §9 riga per riga, e il
predicato dell'avviso nei quattro casi — noto a entrambi, solo al target, solo
all'altro, sconosciuto a entrambi (nessun avviso).

`ddl.test.ts`: uscita attesa esatta su un modello inline; i tre casi degeneri
della §8; la deduplica dei nomi di vincolo, compresa quella su un nome dato
dall'utente; il carattere di citazione dentro un nome di entità, di colonna e di
relazione, per **entrambi** i dialetti; la chiave composta; `CREATE SCHEMA` una
volta per schema distinto e nessuno se nessuna entità ha schema; il determinismo
(due chiamate, stessa stringa).

`mermaid.test.ts`: uscita attesa esatta; il tipo con spazi fra backtick e quello
senza spazi senza backtick; il nome con il punto; il nome con `"` sostituito e
avvisato; le quattro cardinalità nelle due forme; `identifying` nelle due forme;
l'etichetta vuota; l'entità senza attributi.

**e2e**, quarta scena in `scripts/e2e/`: importa un DDL con nomi inventati, apre
il dialog, verifica che l'anteprima non sia vuota in tutti tre i formati e che
cambi fra loro, copia negli appunti e ne rilegge il contenuto, scarica e
controlla la prima riga del file. Cattura `unhandledrejection` come le altre
scene: il `void` su un'azione asincrona trasforma un errore in un timeout muto.

**Una verifica manuale, una volta sola in sviluppo:** il Mermaid generato da una
fixture si incolla in un renderer vero e si guarda che disegni. Nessun test
automatico può dirlo senza aggiungere `mermaid` come dipendenza per una sola
asserzione, e non vale il peso. Va scritta nel commit, non lasciata implicita.

## 15. Domande chiuse durante il brainstorming

- Tipi fuori dal dialetto target → **verbatim più avviso**, nessuna tabella di
  conversione. Il predicato dell'avviso è stato poi stretto (§9) perché la prima
  formulazione segnalava anche i tipi personalizzati validi.
- Relazioni disegnate a mano nel DDL → **commento nel file**, non solo avviso.
- Consegna → **dialog con anteprima, Copia e Scarica**, non download diretto:
  gli avvisi sui tipi hanno bisogno di un posto dove stare, e la
  `NoticeBar` a una riga non è quel posto.
- Nullabilità in Mermaid → **non emessa**.
- Anteprima con evidenziazione della sintassi → **no**, costerebbe una
  dipendenza.
- Identificatori → **sempre citati e sfuggiti**; FK in `ALTER TABLE` separati;
  nessun `DROP`; `CREATE SCHEMA IF NOT EXISTS`.

## 16. Fuori scope

PlantUML (appartiene al class diagram). Export della `view`, cioè delle
posizioni: né il DDL né Mermaid le rappresentano. Migrazioni e diff fra due
schemi. Un terzo dialetto. Evidenziazione della sintassi. Export di più
documenti insieme. Copia dell'immagine negli appunti, che la spec madre elenca
fra le funzioni dell'export immagine e non di questo.
