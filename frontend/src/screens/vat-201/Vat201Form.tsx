/**
 * New VAT 201 filing. Catalog get_or_create_vat_201.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, PageHead } from "../../components/ui";
import { FormLayout } from "../../components/form";

function previousQuarter(): { start: string; end: string } {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const end = new Date(now.getFullYear(), q * 3, 0);
  const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

export default function Vat201Form() {
  const nav = useNavigate();
  const session = useSession();
  const defaults = previousQuarter();
  const create = useFrappePostCall<{ message: string }>(METHOD.getOrCreateVat201);
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [busy, setBusy] = useState(false);

  async function prepare() {
    if (!session.company || !periodStart || !periodEnd) return;
    setBusy(true);
    try {
      const res = await create.call({
        company: session.company,
        period_start: periodStart,
        period_end: periodEnd,
      });
      const name = res?.message;
      if (name) nav(`/vat-201/${encodeURIComponent(name)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/vat-201")}>
            {t("nav.vat201")}
          </button>
        }
        title={t("v201.new")}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/vat-201")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !session.company || create.loading}
              onClick={() => void prepare()}>
              {busy || create.loading ? t("soc.saving") : t("v201.prepare")}
            </button>
          </>
        }
      />
      {create.error && <ErrorBox error={create.error} />}
      <FormLayout>
        <Card>
          <Field label={t("coa.company")} required>
            <input className="ctl" value={session.company || ""} readOnly />
          </Field>
          <Field label={t("v201.periodStart")} required>
            <input className="ctl" type="date" value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)} />
          </Field>
          <Field label={t("v201.periodEnd")} required>
            <input className="ctl" type="date" value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
        </Card>
      </FormLayout>
    </>
  );
}
