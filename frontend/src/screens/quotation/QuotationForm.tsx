/**
 * Quotation form (new + edit). Importers: App.tsx.
 * API: taxmate.api.resource.insert/save on Quotation; taxmate.api.workflow.submit.
 * Schema: party_name(customer), transaction_date, valid_till, items[{item_code,qty,rate,uom}].
 * User: "Implement the plan as specified… complete all the to-dos."
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";

type Line = { item_code: string; item_name?: string; uom?: string; qty: number; rate: number; };
type Party = { customer_address?: string; taxes_and_charges?: string; selling_price_list?: string; currency?: string; tax_id?: string; };
type Doc = {
  name: string; party_name?: string; transaction_date?: string; valid_till?: string; docstatus?: number;
  items?: { item_code?: string; item_name?: string; uom?: string; qty?: number; rate?: number; }[];
};

const today = toIsoDate(new Date());
const plus = (d: number) => { const dt = new Date(); dt.setDate(dt.getDate() + d); return toIsoDate(dt); };

export default function QuotationForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const canSubmit = canSubmitSales(session.roles);

  const existing = useDoc<Doc>(DT.quotation, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall(METHOD.submit);
  const partyCall = useFrappePostCall<{ message: Party }>(METHOD.getPartyDetails);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);

  const [customer, setCustomer] = useState("");
  const [txDate, setTxDate] = useState(today);
  const [validTill, setValidTill] = useState(plus(30));
  const [party, setParty] = useState<Party>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setCustomer(d.party_name || "");
    setTxDate(d.transaction_date || today);
    setValidTill(d.valid_till || plus(30));
    const ls = (d.items ?? []).map((it) => ({
      item_code: it.item_code || "",
      item_name: it.item_name,
      uom: it.uom,
      qty: Number(it.qty) || 1,
      rate: Number(it.rate) || 0,
    }));
    setLines(ls);
  }, [existing.data]);

  useEffect(() => {
    if (!customer) return;
    partyCall.call({ party: customer, party_type: "Customer", doctype: DT.quotation, company: session.company, posting_date: txDate })
      .then((r) => setParty(r?.message ?? {})).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => i === idx ? { ...l, item_code } : l));
    try {
      const r = await itemCall.call({ ctx: { item_code, customer, doctype: DT.quotation, company: session.company, selling_price_list: party.selling_price_list, currency: party.currency, transaction_date: txDate, qty: 1 } });
      const m = (r?.message ?? {}) as Record<string, unknown>;
      setLines((ls) => ls.map((l, i) => i === idx ? { ...l, item_code, item_name: (m.item_name as string) ?? l.item_name, uom: (m.uom as string) ?? l.uom, rate: Number(m.price_list_rate ?? m.rate ?? l.rate) || l.rate } : l));
    } catch { /* surfaced by itemCall.error */ }
  }

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const checks = useMemo(() => [
    { label: t("quot.customer"), ok: !!customer },
    { label: t("quot.date"), ok: !!txDate },
    { label: t("inv.lines"), ok: lines.length > 0 && lines.every((l) => l.item_code) },
  ], [customer, txDate, lines]);
  const ready = checks.every((c) => c.ok);

  async function save(shouldSubmit: boolean) {
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        quotation_to: "Customer",
        party_name: customer,
        transaction_date: txDate,
        valid_till: validTill,
        taxes_and_charges: party.taxes_and_charges || undefined,
        selling_price_list: party.selling_price_list || undefined,
        items: lines.map((l) => ({ item_code: l.item_code, qty: l.qty, rate: l.rate, uom: l.uom })),
      };
      const docname = isNew
        ? (await create.createDoc(DT.quotation, payload) as { name: string }).name
        : (await update.updateDoc(DT.quotation, name, payload), name);
      if (shouldSubmit) await submitCall.call({ doc: { doctype: DT.quotation, name: docname } });
      nav(`/quotations/${encodeURIComponent(docname)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!isNew && existing.data && existing.data.docstatus !== 0) return <Navigate to={`/quotations/${encodeURIComponent(name)}`} replace />;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/quotations")}>{t("nav.quotations")}</button>}
        title={isNew ? t("quot.new") : t("inv.edit")}
        actions={
          <FormActions
            onDiscard={() => nav("/quotations")}
            onSave={() => void save(false)}
            onSubmit={canSubmit ? () => void save(true) : undefined}
            busy={busy} ready={ready} submitLabel={t("inv.submit")}
          />
        }
      />
      {(saveError || partyCall.error) && <ErrorBox error={saveError || partyCall.error} />}
      <FormLayout
        aside={
          <>
            <Card bodyClass="cbody">
              <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("quot.summary")}</h2>
              <SumRow k={t("sod.net")} v={money(net)} />
            </Card>
            <ReadinessCard checks={checks} title={t("soc.ready")} caption={t("soc.readyCap")} />
          </>
        }
      >
        <Card num={1} title={t("soc.b1")}>
          <div className="grid2">
            <Field label={t("quot.customer")} required>
              <LinkField doctype={DT.customer} value={customer} onChange={setCustomer} />
            </Field>
            <Field label={t("f.customerTrn")}>
              <input className="ctl readonly" readOnly value={party.tax_id || ""} />
            </Field>
            <Field label={t("quot.date")} required htmlFor="quot-date">
              <input id="quot-date" className="ctl" type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
            </Field>
            <Field label={t("quot.validTill")} htmlFor="quot-valid">
              <input id="quot-valid" className="ctl" type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} />
            </Field>
          </div>
        </Card>
        <Card num={2} title={t("inv.lines")} bodyClass={null as unknown as string}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("soc.pickItem")}</th>
                  <th className="n">{t("sod.col.qty")}</th>
                  <th className="n">{t("sod.col.rate")}</th>
                  <th className="n">{t("sod.col.amount")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td style={{ color: "var(--faint)", fontSize: 11.5, textAlign: "center" }}>{i + 1}</td>
                    <td style={{ minWidth: 200 }}>
                      <LinkField doctype={DT.item} value={l.item_code} onChange={(v) => void pickItem(i, v)} />
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: parseNum(e.target.value) } : x))} />
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 104 }} value={l.rate}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, rate: parseNum(e.target.value) } : x))} />
                    </td>
                    <td className="n" style={{ fontWeight: 600 }}>{money(l.qty * l.rate)}</td>
                    <td>
                      <button type="button" className="rm" aria-label={t("inv.remove")}
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="addrow">
            <button type="button" className="btn ghost sm"
              onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0 }])}>
              {t("soc.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
