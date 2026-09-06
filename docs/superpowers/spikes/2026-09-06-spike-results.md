# Spike — risultati

Macchina: <modello, browser e versione>

## A. Canvas SVG a mano

| Scenario | Entità | FPS min | Note |
|---|---|---|---|
| drag | 300 | | |
| pan | 300 | | |
| zoom | 300 | | |
| drag | 600 | | |
| drag | 1000 | | |

Performance panel (drag, 300): rendering ms/frame = , scripting ms/frame =

**Verdetto A:** go / no-go — motivazione in una riga.

### Come misurare (da fare a mano, con il mouse)

`pnpm dev`, poi su `http://localhost:5173` in Chrome:

1. Con 300 entità: trascinare un'entità per 5 secondi con movimenti continui. Annotare il valore minimo del contatore FPS in toolbar.
2. Pan (trascinare sullo sfondo) per 5 secondi. Annotare il minimo FPS.
3. Zoom con la rotella avanti e indietro. Annotare il minimo FPS.
4. Ripetere il punto 1 con 600 e con 1000 entità (campo "entità" in toolbar).
5. DevTools → Performance → registrare 5 secondi di drag a 300 entità: annotare il tempo medio per frame di "Rendering" e "Scripting".

Criterio go: ≥ 50 FPS minimo in drag con 300 entità. Sotto i 30 FPS a 300 entità è no-go per l'SVG
a mano con React che ridisegna per nodo, e si valuta lo stato transitorio fuori da React
(mutare `transform` via ref durante il drag).

Scorciatoia senza mouse: il pulsante **auto-drag** in toolbar muove l'entità `t0` di 2 px per frame
per 5 secondi via `requestAnimationFrame` e stampa in console i frame completati e la media fps.
È un drag programmatico di un solo nodo: utile come indicatore, non sostituisce la misura a mano
(non include il costo di hit-testing né i movimenti reali del puntatore).

## B. libpg-query (Postgres)

## C. node-sql-parser (MySQL)

## Decisioni per il piano successivo
