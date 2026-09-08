/**
 * Un tratto di testo SQL. `code` distingue l'SQL vero da stringhe, identificatori quotati e commenti:
 * chi cerca un `;` o un meta-comando deve guardare solo i tratti di codice.
 */
export interface Span {
  start: number
  end: number
  code: boolean
}

/** Meta-comandi psql, insieme chiuso. `pg_dump` 18 racchiude il dump fra `\restrict` e `\unrestrict`. */
const PSQL_META = new Set(["restrict", "unrestrict", "connect", "c", "echo", "set", "unset", "i", "ir", "if", "else", "endif", "encoding", "."])

const endOfLine = (sql: string, from: number): number => {
  const nl = sql.indexOf("\n", from)
  return nl === -1 ? sql.length : nl
}

/** Commenti a blocchi annidabili: Postgres li annida, MySQL no, e contare la profondità va bene per entrambi. */
function blockCommentEnd(sql: string, from: number): number {
  let depth = 0
  let i = from
  while (i < sql.length) {
    if (sql[i] === "/" && sql[i + 1] === "*") {
      depth++
      i += 2
    } else if (sql[i] === "*" && sql[i + 1] === "/") {
      depth--
      i += 2
      if (depth === 0) return i
    } else i++
  }
  return sql.length
}

/** Fine di un literal delimitato da `quote`. Il delimitatore raddoppiato non chiude, il backslash sfugge. */
function quotedEnd(sql: string, from: number, quote: string): number {
  let i = from + 1
  while (i < sql.length) {
    const c = sql[i]
    if (c === "\\") i += 2
    else if (c === quote) {
      if (sql[i + 1] === quote) i += 2
      else return i + 1
    } else i++
  }
  return sql.length
}

/** `$$` o `$tag$` a partire da `i`, o null se quel dollaro non apre un dollar-quote. */
function dollarTagAt(sql: string, i: number): string | null {
  const m = /^\$[A-Za-z_][A-Za-z_0-9]*\$|^\$\$/.exec(sql.slice(i))
  return m ? m[0] : null
}

/** Segmenta il testo in tratti di codice e tratti di literal o commento. Una sola passata. */
export function spans(sql: string): Span[] {
  const out: Span[] = []
  let codeStart = 0
  const closeCode = (at: number) => {
    if (at > codeStart) out.push({ start: codeStart, end: at, code: true })
  }
  const skip = (start: number, end: number) => {
    closeCode(start)
    out.push({ start, end, code: false })
    codeStart = end
    return end
  }

  let i = 0
  while (i < sql.length) {
    const c = sql[i]
    const next = sql[i + 1]
    if ((c === "-" && next === "-") || c === "#") {
      i = skip(i, endOfLine(sql, i))
      continue
    }
    if (c === "/" && next === "*") {
      i = skip(i, blockCommentEnd(sql, i))
      continue
    }
    if (c === "'" || c === '"' || c === "`") {
      i = skip(i, quotedEnd(sql, i, c))
      continue
    }
    if (c === "$") {
      const tag = dollarTagAt(sql, i)
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length)
        i = skip(i, close === -1 ? sql.length : close + tag.length)
        continue
      }
    }
    i++
  }
  closeCode(sql.length)
  return out
}

/** True se `at` cade in un tratto di codice. */
const inCode = (list: readonly Span[], at: number): boolean =>
  list.some((s) => s.code && at >= s.start && at < s.end)

/**
 * Variante di `inCode` con cursore, valida solo per scansioni a posizione monotona crescente come
 * quella di `splitStatements`: invece di cercare in tutta `list` a ogni carattere (quadratico nel
 * numero di tratti — i backtick di un `mysqldump` vero ne producono a migliaia), avanza un indice
 * che non torna mai indietro. `list` copre tutto il testo senza buchi (`spans` lo garantisce), quindi
 * avanzare finché il tratto corrente finisce prima di `at` trova sempre il tratto giusto.
 * Resta privata: non cambia la firma pubblica di `inCode`, usata altrove con accessi non ordinati.
 */
function makeCodeCursor(list: readonly Span[]): (at: number) => boolean {
  let idx = 0
  return (at: number): boolean => {
    while (idx < list.length - 1 && list[idx].end <= at) idx++
    const s = list[idx]
    return s !== undefined && s.code && at >= s.start && at < s.end
  }
}

/**
 * Toglie le righe di meta-comando psql che stanno in stato codice, lasciando il resto intatto —
 * il carattere `\n` compreso, così le posizioni degli statement restano vicine all'originale.
 */
export function stripPsqlMeta(sql: string): { sql: string; removed: string[] } {
  const list = spans(sql)
  const removed: string[] = []
  let out = ""
  let at = 0
  while (at < sql.length) {
    const end = endOfLine(sql, at)
    const line = sql.slice(at, end)
    const m = /^[ \t]*\\([A-Za-z]+|\.)/.exec(line)
    if (m && inCode(list, at + line.indexOf("\\")) && PSQL_META.has(m[1])) {
      removed.push(line.trim())
    } else out += line
    out += end < sql.length ? "\n" : ""
    at = end + 1
  }
  return { sql: out, removed }
}

/** Direttiva `DELIMITER x` di mysqldump: cambia il terminatore degli statement e non è uno statement. */
const DELIMITER = /^[ \t]*DELIMITER[ \t]+(\S+)[ \t]*$/i

/**
 * Spezza in statement rispettando stringhe, identificatori quotati, commenti e `DELIMITER`.
 * I tratti vuoti si scartano; l'ultimo statement senza terminatore non si perde.
 */
export function splitStatements(sql: string): string[] {
  const list = spans(sql)
  const codeAt = makeCodeCursor(list)
  const out: string[] = []
  let terminator = ";"
  let start = 0
  let i = 0

  const push = (end: number) => {
    const text = sql.slice(start, end)
    // Solo lo spazio iniziale si scarta (residuo del terminatore precedente): uno spoglio
    // completo perderebbe un `\n` finale legittimo, come quando lo statement termina dentro
    // un commento di riga e il terminatore vero arriva solo dopo l'a-capo.
    if (text.trim()) out.push(text.trimStart())
  }

  while (i < sql.length) {
    if (!codeAt(i)) {
      i++
      continue
    }
    // La direttiva DELIMITER si riconosce solo a inizio riga, in stato codice.
    if (i === start || sql[i - 1] === "\n") {
      const line = sql.slice(i, endOfLine(sql, i))
      const m = DELIMITER.exec(line)
      if (m) {
        push(i)
        terminator = m[1]
        i = endOfLine(sql, i) + 1
        start = i
        continue
      }
    }
    if (sql.startsWith(terminator, i)) {
      push(i)
      i += terminator.length
      start = i
      continue
    }
    i++
  }
  push(sql.length)
  return out
}

const EXECUTABLE = /^\/\*(?:!|M!)\d*\s*([\s\S]*?)\*\/$/

/**
 * Spoglia il commento eseguibile che racchiude un chunk: `mysqldump` mette in quella forma anche DDL
 * che serve, quindi scartare il chunk intero (come faceva lo spike) perde informazione. null quando
 * il contenuto non è SQL — il marcatore sandbox di MariaDB, per esempio, che comincia per backslash.
 */
export function stripExecutableComments(chunk: string): string | null {
  const m = EXECUTABLE.exec(chunk.trim())
  if (!m) return chunk
  const inner = m[1].trim()
  return /^[A-Za-z(]/.test(inner) ? inner : null
}
