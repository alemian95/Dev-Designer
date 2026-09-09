/**
 * L'export renderizza con `react-dom/server`, che pesa ~59 KB gzip: nel bundle iniziale sarebbe il
 * 37% in più per un'azione che si usa di rado e sempre su richiesta. Si carica al primo click.
 */
export const exportSvg = (): Promise<void> => import("./actions").then((m) => m.exportSvg())
export const exportPng = (): Promise<void> => import("./actions").then((m) => m.exportPng())
