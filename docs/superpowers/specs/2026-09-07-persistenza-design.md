# Persistenza dei documenti — design

Data: 2026-09-07
Spec di riferimento: `docs/superpowers/specs/2026-09-06-dev-designer-design.md`
Sottosistema: lo strato `io` limitato a persistenza e file. Import DDL ed export
restano fuori: sono lavoro successivo, nello stesso strato.

## 1. Obiettivo

Dare ai documenti una vita oltre il ricaricamento della pagina: nessun lavoro
perso, un file su disco che si può versionare in git e portare su un altro
dispositivo, e un ritorno all'app che riprende esattamente da dove si era
rimasti.

Oggi l'app crea un documento in memoria all'avvio e lo perde a ogni
ricaricamento. Esistono già `DocumentSchema` con `schemaVersion` e `id`,
`toJson` che serializza a chiavi ordinate, `parseDocument` che valida e migra, e
`documentStore.load`. Questo sottosistema li usa: non introduce un secondo
formato né un secondo percorso di caricamento.

## 2. Decisioni prese

Quattro scelte chiuse durante il brainstorming, con la loro motivazione, perché
sono quelle da cui discende tutto il resto.

**Il file su disco è la fonte di verità; IndexedDB è la rete di sicurezza.**
Il documento `.dd.json` è l'artefatto: sta in git accanto al codice e si copia
su un altro dispositivo. IndexedDB tiene l'ultimo stato di ogni documento
aperto, così un crash o una chiusura non perdono nulla e i recenti funzionano,
ma è un buffer, non un archivio da consultare. Scartata la biblioteca nel
browser come fonte di verità: i diagrammi resterebbero fuori dal repository, e
svuotare i dati del browser li cancellerebbe.

**Apri e salva su file esistono sempre**, anche dove manca la File System
Access API: lì diventano upload e download. Sono la via per portare un
documento su un altro dispositivo, non un ripiego.

**Al ritorno l'app riapre l'ultimo documento com'era**, contenuto dal buffer,
con l'indicatore delle modifiche non salvate se il buffer è più recente del
file. Zero click per riprendere. Il permesso sul file si richiede al primo
salvataggio, non all'avvio, perché la richiesta deve partire da un gesto
dell'utente.

**Una sola scheda per documento scrive.** La prima che apre un documento ne
prende il lock; le altre lo aprono in sola lettura, con la possibilità di
prendere il controllo. Chiude l'unico modo in cui questo sottosistema potrebbe
perdere lavoro in silenzio: due schede che si sovrascrivono lo stesso record.

**Autosave a documento intero, con debounce.** Scartato un log di patch
incrementali: le patch Immer esistono già per l'undo, ma ricostruire il
documento applicandole introdurrebbe un secondo percorso di caricamento
accanto a `parseDocument`, con migrazioni e bug propri, per risparmiare
millisecondi su una scrittura già fuori dal percorso critico del rendering.

## 3. Architettura

Nasce `src/io`. L'ordine delle dipendenze diventa:

```
model → editor → io → ui
```

La regola `no-restricted-imports` in `eslint.config.js` vieta già `@/io` a
`model` e a `editor`; va estesa a `io` stesso, che può importare `model`,
`editor` e `idb`, ma mai `react` né `src/ui`.

| File | Responsabilità |
|---|---|
| `src/io/db.ts` | IndexedDB via `idb`: apertura, schema, versione, operazioni sui record |
| `src/io/file.ts` | File System Access API con fallback: scelta, lettura, scrittura, download, rilevamento delle capacità e sua forzatura per il test |
| `src/io/document-io.ts` | Orchestrazione senza UI: `newDocument`, `openFromFile`, `save`, `saveAs`, `restoreLast`, `takeControl` |
| `src/io/autosave.ts` | Iscrizione a `documentStore`, debounce, scrittura |
| `src/io/lock.ts` | Web Locks per la proprietà del documento, `BroadcastChannel` per la richiesta di cessione |
| `src/io/document-session.ts` | Store dei metadati del documento aperto |
| `src/ui/DocumentMenu.tsx` | Menu in toolbar: nuovo, apri, salva, salva con nome, recenti, nome e stato |
| `src/ui/ReadOnlyBar.tsx` | Barra "aperto in un'altra scheda" con il pulsante per prendere il controllo |

`document-session.ts` tiene `{ docId, fileName, handle, dirty, readOnly,
lastSavedAt }`: metadati che non appartengono al documento — non finiscono nel
file né nell'undo — ma non sono transitori come il viewport. Non stanno in
`sessionStore` perché `handle` è un oggetto del DOM e lo strato `editor` non
deve conoscerlo.

`document-io.ts` è il posto dove vivono le politiche. Gli altri moduli sono
meccanismo: `db` non sa cosa sia un documento sporco, `file` non sa cosa sia un
buffer.

## 4. Dati

### Record IndexedDB

Due object store, in un database alla versione 1.

```
documents  keyPath: "id"
  { id, name, json, fileName, handle, updatedAt, savedToFileAt }

meta       keyPath: "key"
  { key: "lastOpenedId", value: string }
```

**La chiave è l'`id` che il documento ha già** nel suo schema. Riaprire lo
stesso file ritrova il suo buffer senza dover riconoscere i file per percorso o
per nome — informazione che il browser non dà in modo affidabile.

`json` è la **stringa** prodotta da `toJson`, non l'oggetto. Costa qualche byte
e ripaga subito: al ritorno il buffer passa da `parseDocument` esattamente come
un file da disco, validazione zod e catena di migrazioni comprese. Un buffer
scritto da una versione precedente dell'app si migra da sé invece di essere un
formato parallelo non versionato.

`handle` è il `FileSystemFileHandle`, che IndexedDB memorizza per structured
clone dove l'API esiste; è assente altrove. Il permesso associato **non**
sopravvive al ricaricamento e va richiesto di nuovo da un gesto dell'utente.

`updatedAt` e `savedToFileAt` sono timestamp. Il loro confronto è tutto ciò che
serve per sapere se c'è lavoro non salvato da recuperare.

I recenti sono una query su `documents` ordinata per `updatedAt` discendente,
tenuta a venti voci; le più vecchie si eliminano quando la lista cresce.

### Formato su disco

JSON come già lo produce `toJson`: chiavi in ordine fisso, indentazione 2,
newline finale, così il diff in git è leggibile.

Estensione **`.dd.json`**, doppia di proposito: git, gli editor e i
visualizzatori di diff lo trattano come JSON e lo colorano, e resta
riconoscibile come documento di Dev Designer.

## 5. Flussi

### Avvio

Leggi `lastOpenedId`, carica il record, `parseDocument`, `documentStore.load`,
chiedi il lock.

- Lock ottenuto: la scheda è quella che scrive.
- Lock occupato: il documento si apre in sola lettura, con la barra e il
  pulsante per prendere il controllo.
- Nessun record: crea un documento nuovo, come fa oggi l'app.
- Record presente ma `parseDocument` lo rifiuta: crea un documento nuovo e
  dillo. Un buffer illeggibile è un difetto dell'app, non un errore
  dell'utente, e non deve bloccare l'avvio.

### Autosave

Iscrizione a `documentStore`, debounce di 400 ms, `toJson`, `put` del record con
`updatedAt` aggiornato. Il debounce si azzera a ogni comando, così un drag
continuo non produce trecento scritture. Scrive solo la scheda che ha il lock.

### Sola lettura

Due guardie, non sparse per il codice: `autosave` non scrive, e
`useKeyboardShortcuts` esce subito. Canvas e pannelli stanno sotto un velo
`pointer-events-none` con la barra sopra.

**Un lock Web Locks non si può rubare**: resta della scheda che lo tiene finché
la sua promessa non si risolve o la scheda non chiude. Quindi "prendi il
controllo" non è un'acquisizione forzata ma una richiesta di cessione, e servono
due meccanismi insieme:

- **Web Locks** decide chi possiede il documento. La scheda proprietaria tiene
  un lock chiamato `doc:<id>` con una promessa che si risolve solo quando cede.
- **`BroadcastChannel`** porta la richiesta. La scheda in sola lettura manda
  `{ type: "request", docId }`; la proprietaria riceve, forza un ultimo autosave,
  rilascia il lock e diventa lei di sola lettura; la richiedente, che nel
  frattempo era in attesa su `navigator.locks.request`, lo ottiene, rilegge il
  record — che ora contiene l'ultimo stato dell'altra scheda — e diventa
  proprietaria.

L'ordine conta: l'autosave finale prima del rilascio è ciò che impedisce alla
richiedente di ripartire da un buffer vecchio. Se la scheda proprietaria non
risponde entro qualche secondo — chiusa a metà, sospesa dal sistema — la
richiedente lo dice invece di attendere per sempre; il lock si libererà da solo
alla chiusura della scheda.

### Salva

1. C'è un handle e il permesso è valido: scrivi.
2. C'è un handle ma il permesso è scaduto — succede a ogni ricaricamento:
   richiedilo. La richiesta parte dal click, che è il gesto che il browser
   pretende.
3. Non c'è handle: è un "salva con nome".
4. La File System Access API non esiste: download del file.

Dopo un salvataggio riuscito, `savedToFileAt` si aggiorna e `dirty` si spegne.

### Salva con nome

Picker di salvataggio con `.dd.json` suggerito, oppure download dove l'API
manca. Il nuovo handle e il nuovo nome entrano nel record e nella sessione.

### Apri

Picker o upload, lettura, `parseDocument`. **Il file da disco è un confine di
fiducia**: se zod lo rifiuta non si carica niente e si mostra l'errore, senza
tentare di indovinare la forma corretta.

Se il documento aperto ha un `id` già presente in biblioteca e il buffer è più
recente del file, l'app chiede quale versione tenere invece di scegliere da sé.
È il recupero dopo un crash, e cade fuori gratis dalla scelta di indicizzare per
`id`.

### Nuovo

`createErDocument`, record nuovo, nessun handle. Il documento precedente resta
in biblioteca con il suo buffer.

### Chiusura

Nessun avviso `beforeunload`. Con l'autosave non c'è niente da perdere, e un
dialogo del browser che avvisa di un rischio inesistente è peggio di nessun
dialogo.

### Semantica di `dirty`

Si accende a ogni comando e si spegne solo con un salvataggio su file. Se si
annulla fino a tornare esattamente allo stato del file, resta accesa:
confrontare i contenuti costerebbe un `toJson` a ogni undo per dire una verità
che a nessuno serve.

## 6. Errori

Ognuno con la sua reazione, nessuno inghiottito.

| Situazione | Reazione |
|---|---|
| Quota IndexedDB esaurita | L'app continua senza rete di sicurezza, dicendolo |
| IndexedDB non disponibile (navigazione privata) | Come sopra: si lavora, si salva su file, non c'è autosave |
| File non valido all'apertura | Non si carica; messaggio con l'errore di validazione |
| Permesso sul file negato | Resta il download |
| Handle non più valido (file spostato o cancellato) | Diventa un "salva con nome" |
| Lock non ottenibile | Sola lettura con la barra |

## 7. Test

Vitest sulle funzioni pure:

- scelta del percorso di salvataggio date le capacità del browser e la presenza
  dell'handle;
- confronto fra `updatedAt` e `savedToFileAt` che stabilisce se c'è un buffer da
  recuperare;
- round trip attraverso `toJson` e `parseDocument` di un documento con entità,
  relazioni e `view`;
- potatura dei recenti oltre le venti voci.

Vitest su `db.ts` con **`fake-indexeddb`**, che è la via standard per esercitare
IndexedDB in Node: apertura, `put`, `get`, elenco ordinato, eliminazione.

Un end-to-end Playwright, quello che la spec chiede da sempre e che ancora non
esiste: **disegna un'entità, salva, ricarica, ritrova**. Playwright è già una
dipendenza di sviluppo e si usa il Chrome di sistema con `channel: "chrome"`,
come fa `scripts/perf/fps.mjs`.

Con un vincolo che va detto adesso, perché decide come il test è scritto:
**Playwright non può pilotare i dialoghi della File System Access API**, che sono
finestre native del sistema operativo e non elementi della pagina. Quindi l'e2e
copre il giro attorno a quel dialogo:

- il ritrovamento dopo il ricaricamento passa dal **buffer IndexedDB**, che è la
  parte che conta e che è interamente in pagina;
- il round trip su file si prova sul **percorso di fallback**: il salvataggio
  come download, intercettato con l'evento `download` di Playwright, e
  l'apertura come upload su un `<input type="file">`, riempito con
  `setInputFiles`. Sono gli stessi `readFile` e `parseDocument` del percorso con
  handle, quindi il codice esercitato è quello vero: cambia solo da dove arriva
  il testo.

Il percorso con handle e permessi resta verificato a mano. Perché sia
verificabile a mano in modo sensato, `file.ts` deve permettere di forzare il
fallback — una variabile d'ambiente o un parametro di query — invece di
decidere solo dal rilevamento delle capacità.

Nessun test per componente React, coerentemente con la spec di progetto.

## 8. Dipendenze nuove

| Pacchetto | Dove | Versione al 2026-09-07 | Perché |
|---|---|---|---|
| `idb` | produzione | 8.0.3 | IndexedDB promise-based; l'API nativa a eventi costerebbe un centinaio di righe di ponteggio |
| `fake-indexeddb` | sviluppo | 6.2.5 | Esercitare `db.ts` in Node |

Più il componente shadcn **`dropdown-menu`**, non ancora generato, per il menu
dei documenti. È l'unica aggiunta alla lista dei componenti ammessi.

Il rilevamento delle capacità del browser avviene a runtime (`"showSaveFilePicker"
in window`, `"locks" in navigator`), non contro una tabella di browser e
versioni che invecchierebbe.

## 9. Fuori scope

Import DDL, export SVG/PNG/DDL/Mermaid, appunti, layout automatico: lavoro
successivo, in parte nello stesso strato `io`.

Cartelle di progetto e apertura di più documenti insieme: la spec di progetto
dice un diagramma per file, e un progetto è una cartella di file gestita
dall'utente, non dall'app.

Sincronizzazione fra dispositivi oltre al copiare un file: nessun backend, come
da spec.

Rilevare che il file è stato modificato fuori dall'app mentre era aperto:
possibile con `handle.getFile()` e il confronto di `lastModified` a ogni
salvataggio, ma richiede una politica di risoluzione dei conflitti che non
serve a un utente solo su un file solo. Se servirà, l'aggancio è quello.

## 10. Domande chiuse

- Fonte di verità → **il file**; IndexedDB è la rete di sicurezza.
- Apri e salva su file anche senza File System Access API → **sì**, upload e
  download.
- Al ritorno → **riapre l'ultimo documento**, con l'indicatore delle modifiche
  non salvate.
- Due schede sullo stesso documento → **una sola scrive**, le altre in sola
  lettura con "prendi il controllo".
- Autosave → **documento intero con debounce**, non un log di patch.
- Chiave del record → **l'`id` del documento**, non il nome del file.
- Contenuto del record → **la stringa JSON**, per riusare validazione e
  migrazioni al ritorno.
- Estensione → **`.dd.json`**.
- Avviso alla chiusura → **no**.
