/**
 * Currency Exchange form — new and edit.
 * Importers: App.tsx routes /currency-exchanges/new and /currency-exchanges/:name/edit.
 * API: taxmate.api.resource.insert / save.
 * Schema: date (Date), from_currency (Link), to_currency (Link),
 *   exchange_rate (Float), for_buying (Check), for_selling (Check).
 * User: "Implement the plan… complete all the to-dos."
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";
import LinkField from "../../components/LinkField";

type Doc = {
  name: string;
  date?: string;
  from_currency?: string;
  to_currency?: string;
  exchange_rate?: number;
  for_buying?: 0 | 1;
  for_selling?: 0 | 1;
};

export default function CurrencyExchangeForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const existing = useDoc<Doc>(DT.currencyExchange, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });

  const [exDate, setExDate] = useState(toIsoDate(new Date()));
  const [fromCurr, setFromCurr] = useState("");
  const [toCurr, setToCurr] = useState("AED");
  const [rate, setRate] = useState(1);
  const [forBuying, setForBuying] = useState(true);
  const [forSelling, setForSelling] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  const insert = useInsert();
  const save = useSave();

  useEffect(() => {
    if (!isNew && existing.data) {
      const d = existing.data;
      setExDate(d.date ?? toIsoDate(new Date()));
      setFromCurr(d.from_currency ?? "");
      setToCurr(d.to_currency ?? "AED");
      setRate(d.exchange_rate ?? 1);
      setForBuying(!!d.for_buying);
      setForSelling(!!d.for_selling);
    }
  }, [isNew, existing.data]);

  if (!session.user) return <Navigate to="/" />;
  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  async function handleSave() {
    setSaving(true); setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        doctype: DT.currencyExchange,
        date: exDate,
        from_currency: fromCurr,
        to_currency: toCurr,
        exchange_rate: rate,
        for_buying: forBuying ? 1 : 0,
        for_selling: forSelling ? 1 : 0,
      };
      if (isNew) {
        const created = await insert.createDoc(DT.currencyExchange, body);
        nav(`/currency-exchanges/${encodeURIComponent((created as { name: string }).name)}/edit`);
      } else {
        await save.updateDoc(DT.currencyExchange, name, body);
        nav("/currency-exchanges");
      }
    } catch (e) { setSaveError(e); } finally { setSaving(false); }
  }

  return (
    <>
      <PageHead title={isNew ? t("cx.new") : name} eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/currency-exchanges")}>{t("cx.title")}</button>} />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card title={t("cx.title")}>
          <Field label={t("cx.col.date")}>
            <input className="inp" type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} />
          </Field>
          <Field label={t("cx.col.from")}>
            <LinkField doctype="Currency" value={fromCurr} onChange={setFromCurr} placeholder="USD" />
          </Field>
          <Field label={t("cx.col.to")}>
            <LinkField doctype="Currency" value={toCurr} onChange={setToCurr} placeholder="AED" />
          </Field>
          <Field label={t("cx.col.rate")}>
            <input className="inp" type="number" min={0.000001} step={0.000001} value={rate}
              onChange={(e) => setRate(parseNum(e.target.value))} />
          </Field>
          <Field label="">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={forBuying} onChange={(e) => setForBuying(e.target.checked)} />
              {t("cx.col.forBuying")}
            </label>
          </Field>
          <Field label="">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={forSelling} onChange={(e) => setForSelling(e.target.checked)} />
              {t("cx.col.forSelling")}
            </label>
          </Field>
        </Card>
        <FormActions
          onDiscard={() => nav("/currency-exchanges")}
          onSave={handleSave}
          busy={saving}
        />
      </FormLayout>
    </>
  );
}
