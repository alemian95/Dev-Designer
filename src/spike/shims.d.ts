// node-sql-parser@5.4.0 pubblica già `build/mysql.d.ts` e non ha campo `exports`, quindi con
// `moduleResolution: bundler` il tipo si risolve anche senza questo shim: verificato togliendolo
// (`tsc -b --force` passa lo stesso). Lo teniamo perché è la garanzia contro un `build/*.d.ts`
// mancante in una versione futura, ed è ciò che il piano prescrive.
declare module "node-sql-parser/build/mysql" {
  export * from "node-sql-parser"
}
