/**
 * SupplierQuotationForm — Phase 16.
 * Callers: App.tsx /supplier-quotations/new, /supplier-quotations/:name/edit
 * API: taxmate.api.resource.insert / save on "Supplier Quotation"
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";
import LinkField from "../../components/LinkField";

type Line = { item_code: string; item_name?: string; uom?: string; qty: number; rate: number };
type Party = { taxes_and_charges?: string; currency?: string; payment_terms_template?: string };

const today = toIsoDate(new Date());
const plus = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days); return toIsoDate(d);
};

export default function SupplierQuotationForm() {
  const nav = useNavigate();
  const session = useSession();
  const canSubmit = canSubmitSales(session.roles);
  const { name: editName } = useParams<{ name?: string }>();
  const isEdit = !!editName;

  const [supplier, setSupplier] = useState("");
  const [transDate, setTransDate] = useState(today);
  const [validTill, setValidTill] = useState(plus(30));
  const [taxTemplate, setTaxTemplate] = useState("");
  const [party, setParty] = useState<Party>({});
  const [lines, setLines] = useState<Line[]>([]);

  type SqDoc = { name: string; supplier?: string; transaction_date?: string; valid_till?: string; taxes_and_charges?: string; docstatus?: number; items?: (Line & { name?: string })[] };
  const existing = useDoc<SqDoc>(DT.supplierQuotation, isEdit ? editName : undefined, isEdit ? editName : null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (isEdit && existing.data && !loaded) {
      const d = existing.data;
      if (d.docstatus !== 0) { nav(`/supplier-quotations/${encodeURIComponent(editName!)}`, { replace: true }); return; }
      setSupplier(d.supplier ?? "");
      setTransDate(d.transaction_date ?? today);
      setValidTill(d.valid_till ?? plus(30));
      setTaxTemplate(d.taxes_and_charges ?? "");
      setLines((d.items ?? []).map((l) => ({ item_code: l.item_code ?? "", item_name: l.item_name, uom: l.uom, qty: l.qty ?? 1, rate: l.rate ?? 0 })));
      setLoaded(true);
    }
  }, [isEdit, existing.data, loaded, nav, editName]);

  const templates = useDocList<{ name: string }>(DT.purchaseTaxTemplate, { fields: ["name"], limit: 50 });
  const partyCall = useFrappePostCall<{ message: Party }>(METHOD.getPartyDetails);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall<{ message: { name: string } }>(METHOD.submit);
  const busy = create.loading || update.loading || submitCall.loading;

  useEffect(() => {
    if (!supplier) return;
    partyCall.call({ party: supplier, party_type: "Supplier", doctype: DT.supplierQuotation, company: session.company })
      .then((r) => { if (r?.message) setParty(r.message); })
      .catch(() => undefined);
  }, [supplier]);

  const updateLine = (i: number, field: keyof Line, val: string | number) =>
    setLines((ls) => ls.map((l, idx) => idx === i ? { ...l, [field]: val } : l));

  const addLine = () => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0 }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, idx) => idx !== i));

  async function fetchItemDetails(i: number, code: string) {
    if (!code) return;
    try {
      const res = await itemCall.call({ item_code: code, company: session.company, doctype: DT.supplierQuotation });
      const m = res?.message;
      if (m) updateLine(i, "rate", parseNum((m as Record<string, unknown>).rate as string));
    } catch { /* ignore */ }
  }

  const subtotal = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const ready = !!supplier && lines.length > 0 && lines.every((l) => l.item_code && l.qty > 0);

  async function saveFn(andSubmit = false) {
    if (!ready) return;
    try {
      const payload = {
        supplier,
        company: session.company,
        transaction_date: transDate,
        valid_till: validTill,
        taxes_and_charges: taxTemplate || undefined,
        currency: party.currency,
        items: lines,
      };
      let name: string;
      if (isEdit) {
        await update.updateDoc(DT.supplierQuotation, editName!, payload);
        name = editName!;
      } else {
        const doc = (await create.createDoc(DT.supplierQuotation, payload)) as { name: string };
        name = doc.name;
      }
      if (andSubmit) {
        await submitCall.call({ doctype: DT.supplierQuotation, name });
      }
      nav(`/supplier-quotations/${encodeURIComponent(name)}`);
    } catch (e) { console.error(e); }
  }

  const [saveError, setSaveError] = useState<unknown>(null);

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/supplier-quotations")}>{t("sq.title")}</button>}
        title={isEdit ? (editName ?? t("sq.new")) : t("sq.new")}
      />
      {saveError ? <ErrorBox error={saveError} /> : null}
      <FormLayout>
        <Card title={t("sq.details")}>
          <div className="fg">
            <Field label={t("sq.col.supplier")} required>
              <LinkField doctype={DT.supplier} value={supplier} onChange={setSupplier} placeholder={t("sq.supplierPh")} />
            </Field>
            <Field label={t("sq.col.date")}>
              <input className="ctl" type="date" value={transDate} onChange={(e) => setTransDate(e.target.value)} />
            </Field>
            <Field label={t("sq.col.validTill")}>
              <input className="ctl" type="date" value={validTill} onChange={(e) => setValidTill(e.target.value)} />
            </Field>
            <Field label={t("sq.col.taxTemplate")}>
              <select className="ctl" value={taxTemplate} onChange={(e) => setTaxTemplate(e.target.value)}>
                <option value="">{t("sq.taxTemplatePh")}</option>
                {(templates.data ?? []).map((t2) => <option key={t2.name} value={t2.name}>{t2.name}</option>)}
              </select>
            </Field>
          </div>
        </Card>
        <Card title={t("sq.items")}>
          <div className="twrap">
            <table>
              <thead><tr>
                <th>{t("sq.col.item")}</th>
                <th className="n">{t("sq.col.qty")}</th>
                <th className="n">{t("sq.col.rate")}</th>
                <th className="n">{t("sq.col.amount")}</th>
                <th />
              </tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <LinkField
                        doctype={DT.item}
                        value={l.item_code}
                        onChange={(v) => { updateLine(i, "item_code", v); void fetchItemDetails(i, v); }}
                        placeholder={t("sq.itemPh")}
                      />
                    </td>
                    <td><input className="ctl" type="number" min={0.001} step={0.001} value={l.qty} onChange={(e) => updateLine(i, "qty", parseNum(e.target.value))} /></td>
                    <td><input className="ctl" type="number" min={0} step={0.01} value={l.rate} onChange={(e) => updateLine(i, "rate", parseNum(e.target.value))} /></td>
                    <td className="n tot">{money(l.qty * l.rate)}</td>
                    <td><button type="button" className="btn ghost" onClick={() => removeLine(i)}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn ghost" style={{ marginTop: 8 }} onClick={addLine}>{t("sq.addLine")}</button>
          <SumRow k={t("sq.subtotal")} v={money(subtotal)} />
        </Card>
        <FormActions
          onSave={() => { setSaveError(null); void saveFn(false).catch(setSaveError); }}
          onSubmit={canSubmit ? () => { setSaveError(null); void saveFn(true).catch(setSaveError); } : undefined}
          onDiscard={() => nav(isEdit ? `/supplier-quotations/${encodeURIComponent(editName!)}` : "/supplier-quotations")}
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
