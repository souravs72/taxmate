/** The PDF link used by the print preview screen.
 * Callers: screens/print/PrintPreview.tsx.
 * Printing itself happens in the preview's iframe; nothing opens /printview
 * directly any more, so nothing auto-triggers the browser print dialog.
 */

import { getLang, type Lang } from "./i18n";

/** Frappe's PDF endpoint for one document, in one language. */
export function printPdfUrl(
  doctype: string,
  name: string,
  format?: string,
  lang?: Lang,
  letterhead = true,
): string {
  // download_pdf takes `language`, not printview's `_lang`.
  const p = new URLSearchParams({
    doctype,
    name,
    no_letterhead: letterhead ? "0" : "1",
    language: lang ?? getLang(),
  });
  if (format) p.set("format", format);
  return `/api/method/frappe.utils.print_format.download_pdf?${p.toString()}`;
}
