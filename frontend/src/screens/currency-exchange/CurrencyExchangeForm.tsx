/**
 * Currency Exchange form — new and edit.
 * Importers: App.tsx /currency-exchanges/new and /:name/edit.
 * API: taxmate.api.resource.insert/save. Desk layout via form_layout.get.
 */
import { useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDeskForm } from "../../lib/deskForm";
import { useSession } from "../../lib/session";
import { toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocTabShell from "../../components/DocTabShell";

export default function CurrencyExchangeForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { isNew, existing, values, setField, seed, save, busy, saveError } = useDeskForm(DT.currencyExchange, name);

  useEffect(() => {
    if (!isNew) return;
    seed({
      date: toIsoDate(new Date()),
      to_currency: session.currency || "",
      exchange_rate: 1,
      for_buying: 1,
      for_selling: 1,
    });
  }, [isNew, seed, session.currency]);

  const ready = !!values.from_currency && !!values.to_currency && Number(values.exchange_rate) > 0;

  async function onSave() {
    try {
      const doc = await save();
      nav(`/currency-exchanges/${encodeURIComponent(String(doc.name))}/edit`);
    } catch { /* saveError */ }
  }

  if (!session.user) return <Navigate to="/" />;
  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        title={isNew ? t("cx.new") : name}
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/currency-exchanges")}>{t("cx.title")}</button>}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/currency-exchanges")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void onSave()}>
              {busy ? t("soc.saving") : t("form.save")}
            </button>
          </>
        }
      />

      <DocTabShell doctype={DT.currencyExchange} name={isNew ? "" : name} doc={values} onChange={setField}>
        {saveError ? <ErrorBox error={saveError} /> : null}
      </DocTabShell>
    </>
  );
}
