# Dev Designer

Editor di diagrammi nel browser: un solo canvas raccoglie elementi di tipi diversi, che entrano anche da testo (DDL, Mermaid) e ne escono.

## Linguaggio

**Famiglia**:
Un tipo di contenuto del canvas, con il suo modello: forme, entità ER, classi, flusso, note, sequenze.
_Evitare_: tipo di diagramma, kind

**Formato Mermaid**:
Un tipo di diagramma Mermaid, riconosciuto dalla parola con cui comincia il testo; ogni formato finisce in una sola famiglia, ma una famiglia può accoglierne più d'uno.
_Evitare_: tipo, kind, dialetto

**Frammento**:
Ciò che un formato ricava da un testo, nei termini della famiglia di destinazione, prima di entrare nel documento.
_Evitare_: risultato, AST

**Sequenza**:
Un contenuto della famiglia `sequence`: partecipanti in colonna e una successione ordinata di passi che si legge dall'alto in basso.
_Evitare_: diagramma di sequenza (per il singolo contenuto), timeline

**Partecipante**:
Una colonna di una sequenza, con un nome unico nella sequenza, un'etichetta facoltativa e un genere, partecipante o attore.
_Evitare_: attore (per il partecipante in generale), lifeline

**Passo**:
Un elemento della successione di una sequenza: un messaggio, una nota di sequenza o un blocco.
_Evitare_: riga, istruzione, evento

**Messaggio**:
Un passo che va da un partecipante a un altro, o a sé stesso, con un testo, una linea continua o tratteggiata e una punta.
_Evitare_: freccia, chiamata, arco

**Nota di sequenza**:
Un passo che commenta uno o due partecipanti in un punto della successione, alla loro sinistra, alla loro destra o sopra di loro. È diversa da una Nota, che appartiene alla famiglia delle note e non ha posizione nel tempo.
_Evitare_: nota (da sola), nota ancorata

**Blocco**:
Un passo che racchiude altri passi sotto un operatore (ciclo, alternativa, opzione, parallelo, critico, interruzione) e li divide in una o più sezioni, ognuna con la sua condizione.
_Evitare_: frammento, frammento combinato, gruppo

**Sezione**:
Una parte di un blocco, con una condizione testuale e i suoi passi; le alternative e i rami paralleli sono sezioni dello stesso blocco.
_Evitare_: ramo, operando
