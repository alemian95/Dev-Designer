# 0001. Rappresentazione intermedia neutra fra gli adapter di dialetto e il modello ER

Date: 2026-09-08

## Status

Accepted

## Context

L'import di DDL deve leggere due dialetti, Postgres e MySQL/MariaDB, e i due
parser disponibili producono alberi incompatibili: `libpg-query` (WASM) espone i
nodi di `@pgsql/types`, `node-sql-parser` (UMD/CJS) una struttura sua, con
convenzioni diverse persino nel case dei campi.

Le regole che danno valore all'import non dipendono però dal dialetto:
l'inferenza delle cardinalità dalle foreign key, il calcolo di `identifying`, la
costruzione delle `entityKey`, la risoluzione dei riferimenti fra tabelle.
Mappare ciascun albero direttamente sul modello ER significherebbe scriverle e
testarle due volte, una per parser.

Il modello ha già una scelta vincolante a monte: `AttributeSchema.type` è
`z.string()`, cioè il tipo di una colonna resta la stringa del dialetto
d'origine e non esiste un sistema di tipi unificato fra i due.

C'è infine una considerazione sui test: `fixture .sql → rappresentazione
intermedia attesa` è un confronto leggibile, `fixture .sql → ErModel` no, perché
ci finiscono dentro anche posizionamento e chiavi.

## Decision

Adottiamo una rappresentazione intermedia neutra rispetto al dialetto —
`SqlTable`, `SqlColumn`, `SqlForeignKey`, `ParseWarning`, `DdlParseResult` in
`src/io/ddl/schema.ts` (`5765a89`) — come unico linguaggio fra i parser e il
modello.

Gli adapter (`pg.ts`, `mysql.ts`) producono **solo** rappresentazione
intermedia e non conoscono il modello ER; `map.ts` è l'unico posto che lo
conosce e non conosce alcun AST. Il tipo si chiama `DdlParseResult` e non
`ParseResult` perché `libpg-query` riespone `@pgsql/types`, dove `ParseResult` è
il risultato del parser di Postgres.

## Consequences

Le regole ER si scrivono e si provano una volta sola. Gli adapter si testano
contro la rappresentazione intermedia e `map.ts` contro il modello, senza
bisogno di fixture SQL: un terzo dialetto costerebbe un adapter e nessuna
modifica a `map.ts` né allo strato `editor`.

I due adapter restano deliberatamente **non fattorizzati**. Le funzioni omonime
(`typeText`, `columnNames`, `readCreate`) operano su alberi incompatibili e
divergeranno: unificarle peggiorerebbe il codice. La revisione finale del branch
lo ha confermato, individuando come davvero comuni solo due cose — la regola
«PRIMARY KEY implica NOT NULL», applicata in ciascun adapter, e la ricetta di
troncamento dei messaggi di avviso.

La semantica dei campi al confine diventa load-bearing e va dichiarata:
`SqlColumn.nullable` è la nullabilità **effettiva**, chiavi primarie comprese, e
`map.ts` se ne fida per dedurre se un attributo è opzionale invece di
ricontrollarla (`78eb309`).

Ciò che un dialetto non riesce a esprimere emerge come avviso all'utente invece
di essere normalizzato prima del parse. Con `REFERENCES tabella` senza lista di
colonne — sintassi standard che significa «la chiave primaria del referenziato»
— i due dialetti divergono: in Postgres la foreign key arriva con `refColumns`
vuoto e viene risolta sulla chiave primaria della tabella target dentro `map.ts`
(`f2ec3f0`), in un solo posto valido per entrambi i dialetti; in MySQL
`node-sql-parser` rifiuta invece l'intero `CREATE TABLE` e la tabella si perde
con un avviso. La divergenza è accettata: aggirarla richiederebbe di
normalizzare il testo SQL prima di passarlo al parser, lavoro che si affronterà
solo se il caso si presenta su un dump reale.
