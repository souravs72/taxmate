/** Open the print preview for this document.
    The format, the language and the letterhead are chosen there, so this is
    one button rather than a pair. */
import { useNavigate } from "react-router-dom";

import { t } from "../i18n/strings";
import { isNative } from "../mobile/platform";

export function PrintLangButtons({
  doctype,
  name,
  format,
}: {
  doctype: string;
  name: string;
  /** Omit to let the server pick: its own default, else the TaxMate one. */
  format?: string;
}) {
  const nav = useNavigate();
  if (isNative() || !name) return null;
  const to = `/print/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`
    + (format ? `?format=${encodeURIComponent(format)}` : "");
  return (
    <button type="button" className="btn ghost" onClick={() => nav(to)}>
      {t("inv.print")}
    </button>
  );
}
