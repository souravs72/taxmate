/**
 * Print preview — see the document before it prints, pick the format and
 * the language.
 * Callers: App.tsx route /print/:doctype/:name; PrintLangButtons.
 * API: taxmate.api.printing.render (html + style + the formats on offer).
 * User: "we would need an erpnext like screen where we can see the print
 * format, and able to toggle the language".
 *
 * The rendered document goes in a sandboxed iframe, not into the page. A
 * print format carries its own CSS, including bare `table`/`h2` rules that
 * would otherwise repaint the SPA around it, and printing the iframe prints
 * the document alone rather than the app chrome with it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFrappeGetCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { printPdfUrl } from "../../lib/printDoc";
import { useLang, type Lang } from "../../lib/i18n";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead } from "../../components/ui";
import "./print.css";

type Fmt = { name: string; label: string; taxmate: boolean };
type Payload = {
  html?: string;
  style?: string;
  format?: string;
  formats?: Fmt[];
  language?: string;
  letterhead?: number;
};

/** The document, its style, and nothing of ours. */
function frameDoc(html: string, style: string, lang: Lang): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">
<style>${style || ""}</style>
<style>
  html,body{margin:0;padding:0;background:#fff}
  body{padding:12px}
  @media print{body{padding:0}}
</style>
</head><body>${html || ""}</body></html>`;
}

export default function PrintPreview() {
  const { doctype = "", name = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const frame = useRef<HTMLIFrameElement>(null);

  const { lang: uiLang } = useLang();
  const [format, setFormat] = useState(params.get("format") ?? "");
  const [lang, setLang] = useState<Lang>((params.get("lang") as Lang) || uiLang);
  const [letterhead, setLetterhead] = useState(params.get("letterhead") !== "0");

  /* Default to the language the app is in. The session language arrives
     after the first render, so reading it once at mount would pin an Arabic
     user to an English print. Only a named language (link or picker) stops
     this following — a deep link that only names the format must still
     pick up Arabic/English from the session. */
  const langChosen = useRef(!!params.get("lang"));
  const optionsTouched = useRef(
    !!params.get("lang") || !!params.get("format") || params.get("letterhead") === "0",
  );
  useEffect(() => {
    if (!langChosen.current) setLang(uiLang);
  }, [uiLang]);
  const pickLang = (next: Lang) => { langChosen.current = true; optionsTouched.current = true; setLang(next); };
  const pickFormat = (next: string) => { optionsTouched.current = true; setFormat(next); };
  const pickLetterhead = (next: boolean) => { optionsTouched.current = true; setLetterhead(next); };

  /* The URL carries the choice, so a preview is a link someone can send —
     but only once something has actually been chosen. Writing it on mount
     would make the default look like a decision, and under StrictMode's
     remount the component would then read its own write back and stop
     following the app language. */
  useEffect(() => {
    if (!optionsTouched.current) return;
    const next = new URLSearchParams();
    if (format) next.set("format", format);
    if (langChosen.current) next.set("lang", lang);
    if (!letterhead) next.set("letterhead", "0");
    setParams(next, { replace: true });
  }, [format, lang, letterhead, setParams]);

  const args = useMemo(
    () => ({
      doctype,
      name,
      print_format: format || undefined,
      language: lang,
      letterhead: letterhead ? 1 : 0,
    }),
    [doctype, name, format, lang, letterhead],
  );

  const { data, error, isLoading } = useFrappeGetCall<{ message: Payload }>(
    METHOD.printRender,
    args,
    doctype && name ? `print-${doctype}-${name}-${format}-${lang}-${letterhead}` : null,
  );

  const payload = data?.message;
  const formats = payload?.formats ?? [];

  /* The server decides the default; adopt it so the picker shows the truth. */
  useEffect(() => {
    if (!format && payload?.format) setFormat(payload.format);
  }, [format, payload?.format]);

  const srcDoc = useMemo(
    () => (payload ? frameDoc(payload.html ?? "", payload.style ?? "", lang) : ""),
    [payload, lang],
  );

  const doPrint = () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  const pdfHref = printPdfUrl(doctype, name, format || payload?.format, lang, letterhead);

  if (!doctype || !name) return <ErrorBox error={new Error(t("print.missingDoc"))} />;

  return (
    <div className="pv">
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav(-1)}>
            {t("common.back")}
          </button>
        }
        title={name}
      />
      {error ? <ErrorBox error={error} /> : null}
      <div className="pv-wrap">
        <div className="pv-paper">
          {isLoading && !payload ? (
            <Loading />
          ) : (
            <iframe
              ref={frame}
              className="pv-frame"
              title={t("print.previewTitle")}
              sandbox="allow-same-origin allow-modals"
              srcDoc={srcDoc}
            />
          )}
        </div>

        <Card title={t("print.options")} bodyClass="pv-rail">
          <label className="pv-field">
            <span>{t("print.format")}</span>
            <select
              className="ctl"
              value={format}
              onChange={(e) => pickFormat(e.target.value)}
              disabled={!formats.length}
            >
              {formats.map((f) => (
                <option key={f.name} value={f.name}>{f.label}</option>
              ))}
            </select>
          </label>

          <div className="pv-field">
            <span>{t("print.language")}</span>
            <div className="seg" role="group" aria-label={t("print.language")}>
              <button type="button" aria-pressed={lang === "en"} onClick={() => pickLang("en")}>
                English
              </button>
              <button type="button" aria-pressed={lang === "ar"} onClick={() => pickLang("ar")}>
                عربي
              </button>
            </div>
          </div>

          <label className="pv-check">
            <input
              type="checkbox"
              checked={letterhead}
              onChange={(e) => pickLetterhead(e.target.checked)}
            />
            <span>{t("print.letterhead")}</span>
          </label>

          <div className="pv-actions">
            <button type="button" className="btn" onClick={doPrint} disabled={!payload}>
              {t("print.print")}
            </button>
            <a className="btn ghost" href={pdfHref} target="_blank" rel="noopener">
              {t("print.pdf")}
            </a>
          </div>
        </Card>
      </div>
    </div>
  );
}
