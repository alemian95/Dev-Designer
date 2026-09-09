# 0005. Un solo emettitore DDL per i due dialetti

Date: 2026-09-09

## Status

Accepted

## Context

L'ADR 0001 tiene i due parser di dialetto (`pg.ts`, `mysql.ts`) **deliberatamente
non fattorizzati**: i due AST sono incompatibili, le funzioni omonime operano su
strutture diverse e divergeranno, quindi unificarle peggiorerebbe il codice.

L'export presenta il caso apparentemente gemello: due dialetti, due uscite. Letta
di sfuggita, la decisione dell'ADR 0001 direbbe «due emettitori».

## Decision

Un solo `emitDdl(model, dialect)` in `src/io/emit/ddl.ts`, con il dialetto
ridotto a due differenze: il carattere di citazione e l'insieme dei tipi noti.

## Consequences

Il caso è **simmetrico**, non contrario, a quello dell'ADR 0001. Là gli ingressi
sono due alberi incompatibili e ciò che sembra comune non lo è; qui l'ingresso è
uno solo — la stessa `ErModel` — e ciò che differisce è quasi nulla. Due
emettitori duplicherebbero per intero la generazione di `CREATE TABLE`, dei
vincoli e degli `ALTER TABLE`, cioè quasi tutto il file.

È la stessa regola applicata a un input diverso: fattorizza ciò che è davvero
comune, non ciò che si somiglia. Questo ADR esiste perché senza di esso la
prossima lettura vedrebbe due decisioni opposte e ne dedurrebbe un'incoerenza.

Un terzo dialetto costa un ramo in `quote` e un insieme di tipi. Il giorno in cui
un dialetto chiedesse una forma di `CREATE TABLE` diversa — non solo un
delimitatore diverso — questa decisione va rivista, non estesa con condizioni.
