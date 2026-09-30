/** Desk print view. The server checks print permission; the SPA does not add an endpoint.
 * Callers: quotation, sales order, and delivery note detail screens.
 * API: none. Opens /printview.
 */

export function printDocUrl(doctype: string, name: string, format?: string): string {
  const p = new URLSearchParams({
    doctype,
    name,
    trigger_print: "1",
    no_letterhead: "0",
  });
  if (format) p.set("format", format);
  return `/printview?${p.toString()}`;
}
