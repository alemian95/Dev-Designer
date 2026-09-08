# 0003. `source.attributes` vuoto come marcatore delle relazioni disegnate a mano

Date: 2026-09-08

## Status

Accepted

## Context

L'import di DDL è ri-eseguibile sullo stesso documento: si importa uno schema, si
sistema il diagramma a mano, e più tardi si re-importa lo stesso schema
aggiornato. Il comando innesta le entità in arrivo nel documento aperto con una
sola `dispatch` annullabile.

Le relazioni pongono un problema che le entità non hanno. Senza potatura, un
re-import le duplica: le stesse foreign key generano di nuovo le stesse
relazioni, con chiavi diverse. Con una potatura che elimina tutte le relazioni
delle entità in arrivo, invece, spariscono anche le connessioni che l'utente ha
disegnato a mano fra quelle entità — perdita silenziosa di lavoro suo.

Serve quindi distinguere una relazione derivata da una foreign key da una
disegnata a mano. Il modello dichiara già la differenza: in
`RelationshipEndSchema`, il campo `attributes` è documentato *«vuoto per
relazioni disegnate a mano»*, perché una connessione tracciata sul canvas non
nomina colonne, mentre una derivata da una FK le nomina per costruzione.

## Decision

Adottiamo quell'invariante come marcatore. La potatura in
`src/editor/commands/import.ts` (`ace661c`) elimina le relazioni il cui
`source.entity` è fra le entità in arrivo **e** che hanno `source.attributes` non
vuoto; le chiavi delle relazioni nuove si assegnano dopo la potatura, non prima.

Ne segue un obbligo su chi produce relazioni derivate: `map.ts` deve riempire
`attributes`, e una foreign key che non lo consenta va scartata con un avviso
anziché generare una relazione con `attributes` vuoto.

## Consequences

Ogni futuro produttore di relazioni è vincolato da questa convenzione:
`attributes` vuoto significa «disegnata a mano», e violarlo non produce un bug
visibile subito, ma la cancellazione di dati dell'utente al re-import
successivo. È il rischio più costoso di tutto il sottosistema, e per questo la
revisione finale del branch lo ha seguito lungo l'intera catena in entrambe le
direzioni, verificando che nessun cammino porti al modello una relazione
derivata con `source.attributes` vuoto.

L'ordine delle operazioni nella recipe è parte della decisione e non un
dettaglio: calcolare le chiavi prima della potatura le farebbe collidere con
relazioni che stanno per sparire, e `uniqueKey` produrrebbe suffissi `_2`
inutili.

Un re-import di contenuto **identico** aggiunge comunque una voce alla storia
delle modifiche, perché Immer genera le patch per identità di riferimento e gli
oggetti `Entity` sono ricreati a ogni parse. È accettato: premere «Importa» è
un'azione deliberata dell'utente, e renderla un no-op richiederebbe un confronto
strutturale su ogni entità a ogni import — complessità reale per un caso
benigno. Solo l'import letteralmente vuoto è un no-op.

Una foreign key che nomina una colonna inesistente produce `attributes` con un
nome fantasma: non vuoto, quindi l'invariante regge e la relazione resta
visibile sul diagramma, dove l'utente può vederla e correggerla.
