import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormLayout } from "../../components/form";
import LinkField from "../../components/LinkField";

type Line = {
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  rate: number;
  uom?: string;
  expense_account?: string;
  cost_center?: string;
  item_tax_template?: string;
};

type Party = {
  supplier_address?: string;
  taxes_and_charges?: string;
  buying_price_list?: string;
  payment_terms_template?: string;
  tax_id?: string;
  currency?: string;
  credit_to?: string;
  due_date?: string;
};

type InvoiceDoc = {
  name: string;
  supplier?: string;
  supplier_name?: string;
  posting_date?: string;
  due_date?: string;
  bill_no?: string;
  company?: string;
  vat_emirate?: string;
  taxes_and_charges?: string;
  tax_id?: string;
  payment_terms_template?: string;
  net_total?: number;
  total_taxes_and_charges?: number;
  grand_total?: number;
  currency?: string;
  docstatus?: 0 | 1 | 2;
  items?: Line[];
};

export default function PurchaseInvoiceForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const existing = useDoc<InvoiceDoc>(DT.purchaseInvoice, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const defaults = useFrappePostCall<{ message: { company?: string; currency?: string; tax_id?: string } }>(METHOD.getDefaults);
  const partyCall = useFrappePostCall<{ message: Party }>(METHOD.getPartyDetails);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);
  const submitCall = useFrappePostCall<{ message: InvoiceDoc }>(METHOD.submit);
  const create = useInsert();
  const update = useSave();
  const templates = useDocList<{ name: string }>(DT.purchaseTaxTemplate, { fields: ["name"], limit: 50 });
  const terms = useDocList<{ name: string }>(DT.paymentTerms, { fields: ["name"], limit: 50 });

  const [supplier, setSupplier] = useState("");
  const [postingDate, setPostingDate] = useState(toIsoDate(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [billNo, setBillNo] = useState("");
  const [emirate, setEmirate] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [party, setParty] = useState<Party>({});
  const [companyDefaults, setCompanyDefaults] = useState<{ company?: string; currency?: string; tax_id?: string }>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    defaults.call({}).then((r) => setCompanyDefaults(r?.message ?? {})).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setSupplier(d.supplier || "");
    setPostingDate(d.posting_date || toIsoDate(new Date()));
    setDueDate(d.due_date || "");
    setBillNo(d.bill_no || "");
    setEmirate(d.vat_emirate || "");
    setTaxTemplate(d.taxes_and_charges || "");
    setPaymentTerms(d.payment_terms_template || "");
    setLines((d.items ?? []).map((l) => ({
      item_code: l.item_code, item_name: l.item_name, description: l.description,
      qty: l.qty, rate: l.rate, uom: l.uom, expense_account: l.expense_account,
      cost_center: l.cost_center, item_tax_template: l.item_tax_template,
    })));
  }, [existing.data]);

  useEffect(() => {
    if (!supplier) return;
    partyCall
      .call({
        party: supplier,
        party_type: "Supplier",
        doctype: DT.purchaseInvoice,
        company: companyDefaults.company || session.company,
        posting_date: postingDate,
      })
      .then((r) => {
        const m = r?.message ?? {};
        setParty(m);
        if (m.taxes_and_charges && !taxTemplate) setTaxTemplate(m.taxes_and_charges);
        if (m.payment_terms_template && !paymentTerms) setPaymentTerms(m.payment_terms_template);
        if (m.due_date && !dueDate) setDueDate(m.due_date);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => i === idx ? { ...l, item_code } : l));
    try {
      const r = await itemCall.call({
        ctx: {
          item_code,
          supplier,
          doctype: DT.purchaseInvoice,
          company: companyDefaults.company || session.company,
          currency: party.currency || companyDefaults.currency || session.currency,
          conversion_rate: 1,
          buying_price_list: party.buying_price_list,
          qty: 1,
        },
      });
      const m = r?.message ?? {};
      setLines((ls) => ls.map((l, i) => i === idx ? {
        ...l,
        item_code,
        item_name: String(m.item_name ?? l.item_name ?? ""),
        description: String(m.description ?? l.description ?? ""),
        uom: String(m.uom ?? l.uom ?? ""),
        rate: Number(m.price_list_rate ?? m.rate ?? l.rate) || l.rate,
        expense_account: String(m.expense_account ?? ""),
        cost_center: String(m.cost_center ?? ""),
        item_tax_template: m.item_tax_template ? String(m.item_tax_template) : undefined,
      } : l));
    } catch { /* itemCall.error */ }
  }

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const doc = existing.data;
  const canSubmit = canSubmitSales(session.roles);
  const ready = !!supplier && !!postingDate && !!emirate && lines.length > 0 && lines.every((l) => l.item_code);
  const currency = doc?.currency || party.currency || companyDefaults.currency || session.currency || undefined;

  function payload() {
    return {
      supplier,
      posting_date: postingDate,
      due_date: dueDate || undefined,
      bill_no: billNo || undefined,
      company: companyDefaults.company || session.company,
      vat_emirate: emirate,
      taxes_and_charges: taxTemplate || undefined,
      payment_terms_template: paymentTerms || undefined,
      supplier_address: party.supplier_address,
      buying_price_list: party.buying_price_list,
      credit_to: party.credit_to,
      currency: party.currency || companyDefaults.currency || session.currency,
      conversion_rate: 1,
      items: lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        description: l.description,
        expense_account: l.expense_account,
        cost_center: l.cost_center,
        item_tax_template: l.item_tax_template,
      })),
    };
  }

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const docname = isNew
        ? (await create.createDoc(DT.purchaseInvoice, payload()) as { name: string }).name
        : (await update.updateDoc(DT.purchaseInvoice, name, payload()), name);
      nav(`/purchase-invoices/${encodeURIComponent(docname)}`);
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  async function submitDoc() {
    setBusy(true); setSaveError(null);
    try {
      let docname = name;
      if (isNew) {
        const created = await create.createDoc(DT.purchaseInvoice, payload());
        docname = (created as { name: string }).name;
      } else {
        await update.updateDoc(DT.purchaseInvoice, name, payload());
      }
      await submitCall.call({ doc: { doctype: DT.purchaseInvoice, name: docname } });
      nav(`/purchase-invoices/${encodeURIComponent(docname)}`);
    } catch (err) {
      setSaveError(err);
      if (!isNew) await existing.mutate();
    } finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!isNew && existing.data && existing.data.docstatus !== 0) {
    return <Navigate to={`/purchase-invoices/${encodeURIComponent(name)}`} replace />;
  }

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/purchase-invoices")}>
            {t("nav.purchaseInvoices")}
          </button>
        }
        title={isNew ? t("pi.new") : (doc?.supplier_name || supplier || name)}
        actions={
          <>
            <button type="button" className="btn quiet" onClick={() => nav("/purchase-invoices")}>{t("soc.discard")}</button>
            <button type="button" className="btn ghost" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
            {canSubmit && (
              <button type="button" className="btn" disabled={busy || !ready} onClick={() => void submitDoc()}>
                {t("inv.submit")}
              </button>
            )}
          </>
        }
      />

      {(saveError || partyCall.error || submitCall.error) && (
        <ErrorBox error={saveError || partyCall.error || submitCall.error} />
      )}

      <FormLayout aside={
        <Card bodyClass="cbody">
          <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("inv.totals")}</h2>
          <SumRow k={t("sod.net")} v={money(doc?.net_total ?? net)} currency={currency} />
          <SumRow k={t("sod.vat")} v={money(doc?.total_taxes_and_charges ?? 0)} currency={currency} />
          <SumRow k={t("sod.grand")} v={money(doc?.grand_total ?? net)} cls="rule total" currency={currency} />
        </Card>
      }>
        <Card num={1} title={t("pi.who")}>
          <div className="grid2">
            <Field label={t("nav.suppliers")} required>
              <LinkField doctype={DT.supplier} value={supplier} onChange={setSupplier} />
            </Field>
            <Field label={t("inv.date")} required>
              <input className="ctl" type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} />
            </Field>
            <Field label={t("inv.due")}>
              <input className="ctl" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label={t("pi.billNo")}>
              <input className="ctl" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </Field>
          </div>
          <div className="numblk">
            <span className="infochip"><span className="k2">T</span>{t("pi.supplierTrn")} <b>{party.tax_id || doc?.tax_id || "—"}</b></span>
            <span className="infochip"><span className="k2">C</span>{t("f.companyTrn")} <b>{companyDefaults.tax_id || "—"}</b></span>
          </div>
        </Card>

        <Card num={2} title={t("soc.b2")}>
          <div className="grid2">
            <Field label={t("f.emirate")} required>
              <select className="ctl" value={emirate} onChange={(e) => setEmirate(e.target.value)}>
                <option value="" />
                {UAE_EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label={t("f.taxTemplate")}>
              <select className="ctl" value={taxTemplate} onChange={(e) => setTaxTemplate(e.target.value)}>
                <option value="" />
                {(templates.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
              </select>
            </Field>
            <Field label={t("f.paymentTerms")}>
              <select className="ctl" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                <option value="" />
                {(terms.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
              </select>
            </Field>
          </div>
        </Card>

        <Card num={3} title={t("inv.lines")} bodyClass={null as unknown as string}>
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
                    <td style={{ minWidth: 220 }}>
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
            <button type="button" className="btn ghost sm" onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0 }])}>
              ＋ {t("soc.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
