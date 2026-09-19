import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeCreateDoc, useFrappeGetDoc, useFrappeGetDocList, useFrappePostCall, useFrappeUpdateDoc } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { canCancelSales, canSubmitSales, eInvoiceLocked } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { EINVOICE_PILL, INV_PILL_CLASS, invoiceUiStatus } from "../../lib/status";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead, Pill, SumRow } from "../../components/ui";
import LinkField from "../../components/LinkField";

type Line = {
  item_code: string;
  item_name?: string;
  description?: string;
  qty: number;
  rate: number;
  uom?: string;
  income_account?: string;
  cost_center?: string;
  item_tax_template?: string;
  uae_item_type?: string;
  hs_code?: string;
  sac_code?: string;
};

type Party = {
  customer_address?: string;
  taxes_and_charges?: string;
  selling_price_list?: string;
  payment_terms_template?: string;
  tax_id?: string;
  currency?: string;
  debit_to?: string;
  due_date?: string;
};

type InvoiceDoc = {
  name: string;
  customer?: string;
  customer_name?: string;
  posting_date?: string;
  due_date?: string;
  po_no?: string;
  company?: string;
  vat_emirate?: string;
  taxes_and_charges?: string;
  tax_id?: string;
  company_trn?: string;
  payment_terms_template?: string;
  net_total?: number;
  total_taxes_and_charges?: number;
  grand_total?: number;
  outstanding_amount?: number;
  currency?: string;
  docstatus?: 0 | 1 | 2;
  status?: string;
  is_return?: number;
  return_against?: string;
  uae_e_invoice_status?: string;
  uae_credit_note_reason?: string;
  items?: Line[];
};

export default function InvoiceForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const existing = useFrappeGetDoc<InvoiceDoc>(DT.salesInvoice, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const defaults = useFrappePostCall<{ message: { company?: string; currency?: string; tax_id?: string } }>(METHOD.getDefaults);
  const partyCall = useFrappePostCall<{ message: Party }>(METHOD.getPartyDetails);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);
  const submitCall = useFrappePostCall<{ message: InvoiceDoc }>(METHOD.submit);
  const cancelCall = useFrappePostCall(METHOD.cancel);
  const einvoiceCall = useFrappePostCall(METHOD.generateEInvoice);
  const create = useFrappeCreateDoc();
  const update = useFrappeUpdateDoc();
  const templates = useFrappeGetDocList<{ name: string }>(DT.taxTemplate, { fields: ["name"], limit: 50 });
  const terms = useFrappeGetDocList<{ name: string }>(DT.paymentTerms, { fields: ["name"], limit: 50 });

  const [customer, setCustomer] = useState("");
  const [postingDate, setPostingDate] = useState(toIsoDate(new Date()));
  const [dueDate, setDueDate] = useState("");
  const [poNo, setPoNo] = useState("");
  const [emirate, setEmirate] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [party, setParty] = useState<Party>({});
  const [companyDefaults, setCompanyDefaults] = useState<{ company?: string; currency?: string; tax_id?: string }>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    defaults.call({}).then((r) => setCompanyDefaults(r?.message ?? {})).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setCustomer(d.customer || "");
    setPostingDate(d.posting_date || toIsoDate(new Date()));
    setDueDate(d.due_date || "");
    setPoNo(d.po_no || "");
    setEmirate(d.vat_emirate || "");
    setTaxTemplate(d.taxes_and_charges || "");
    setPaymentTerms(d.payment_terms_template || "");
    setReason(d.uae_credit_note_reason || "");
    setLines((d.items ?? []).map((l) => ({
      item_code: l.item_code, item_name: l.item_name, description: l.description,
      qty: l.qty, rate: l.rate, uom: l.uom, income_account: l.income_account,
      cost_center: l.cost_center, uae_item_type: l.uae_item_type, hs_code: l.hs_code, sac_code: l.sac_code,
    })));
  }, [existing.data]);

  useEffect(() => {
    if (!customer) return;
    partyCall
      .call({
        party: customer,
        party_type: "Customer",
        doctype: DT.salesInvoice,
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
  }, [customer]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => i === idx ? { ...l, item_code } : l));
    try {
      const r = await itemCall.call({
        ctx: {
          item_code,
          customer,
          doctype: DT.salesInvoice,
          company: companyDefaults.company || session.company,
          currency: party.currency || companyDefaults.currency || session.currency,
          conversion_rate: 1,
          selling_price_list: party.selling_price_list,
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
        income_account: String(m.income_account ?? ""),
        cost_center: String(m.cost_center ?? ""),
        item_tax_template: m.item_tax_template ? String(m.item_tax_template) : undefined,
        uae_item_type: m.uae_item_type ? String(m.uae_item_type) : undefined,
        hs_code: m.hs_code ? String(m.hs_code) : undefined,
        sac_code: m.sac_code ? String(m.sac_code) : undefined,
      } : l));
    } catch { /* itemCall.error */ }
  }

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const doc = existing.data;
  const submitted = doc?.docstatus === 1;
  const cancelled = doc?.docstatus === 2;
  const locked = submitted || cancelled;
  const canSubmit = canSubmitSales(session.roles);
  const canCancel = canCancelSales(session.roles) && !eInvoiceLocked(doc?.uae_e_invoice_status);
  const ready = !!customer && !!postingDate && !!emirate && lines.length > 0 && lines.every((l) => l.item_code);
  const currency = doc?.currency || party.currency || companyDefaults.currency || session.currency || undefined;

  function payload() {
    return {
      customer,
      posting_date: postingDate,
      due_date: dueDate || undefined,
      po_no: poNo || undefined,
      company: companyDefaults.company || session.company,
      vat_emirate: emirate,
      taxes_and_charges: taxTemplate || undefined,
      payment_terms_template: paymentTerms || undefined,
      customer_address: party.customer_address,
      selling_price_list: party.selling_price_list,
      debit_to: party.debit_to,
      currency: party.currency || companyDefaults.currency || session.currency,
      conversion_rate: 1,
      uae_credit_note_reason: reason || undefined,
      items: lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        description: l.description,
        income_account: l.income_account,
        cost_center: l.cost_center,
        item_tax_template: l.item_tax_template,
      })),
    };
  }

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      if (isNew) {
        const created = await create.createDoc(DT.salesInvoice, payload());
        nav(`/invoices/${encodeURIComponent((created as { name: string }).name)}`);
      } else {
        await update.updateDoc(DT.salesInvoice, name, payload());
        await existing.mutate();
      }
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  async function submitDoc() {
    setBusy(true); setSaveError(null);
    try {
      let docname = name;
      if (isNew) {
        const created = await create.createDoc(DT.salesInvoice, payload());
        docname = (created as { name: string }).name;
      } else {
        await update.updateDoc(DT.salesInvoice, name, payload());
      }
      await submitCall.call({ doc: { doctype: DT.salesInvoice, name: docname } });
      if (isNew) {
        nav(`/invoices/${encodeURIComponent(docname)}`);
      } else {
        await existing.mutate();
      }
    } catch (err) {
      setSaveError(err);
      if (!isNew) await existing.mutate();
    } finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  const ui = invoiceUiStatus(doc ?? { docstatus: 0 });

  return (
    <>
      <PageHead
        eyebrow={<a onClick={() => nav("/invoices")} style={{ color: "var(--brand)", cursor: "pointer" }}>{t("nav.invoices")}</a>}
        title={isNew ? t("inv.new") : (doc?.customer_name || customer || name)}
        actions={
          <>
            <button className="btn quiet" onClick={() => nav("/invoices")}>{t("soc.discard")}</button>
            {!locked && (
              <button className="btn ghost" disabled={busy || !ready} onClick={() => void save()}>
                {busy ? t("soc.saving") : t("soc.save")}
              </button>
            )}
            {!locked && canSubmit && (
              <button className="btn" disabled={busy || !ready} onClick={() => void submitDoc()}>{t("inv.submit")}</button>
            )}
            {submitted && canSubmit && (
              <button className="btn ghost" onClick={() => nav(`/payments/new?invoice=${encodeURIComponent(name)}`)}>
                {t("inv.receive")}
              </button>
            )}
            {submitted && canSubmit && !doc?.is_return && (
              <button className="btn ghost" onClick={() => nav(`/invoices/${encodeURIComponent(name)}/return`)}>
                {t("inv.credit")}
              </button>
            )}
            {submitted && canSubmit && (
              <button className="btn ghost" disabled={einvoiceCall.loading}
                onClick={() => void einvoiceCall.call({ docname: name, doctype: DT.salesInvoice }).then(() => existing.mutate())}>
                {t("inv.einvoice")}
              </button>
            )}
            {submitted && canCancel && (
              <button className="btn quiet" onClick={() => void cancelCall.call({ doctype: DT.salesInvoice, name }).then(() => existing.mutate())}>
                {t("inv.cancel")}
              </button>
            )}
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <Pill cls={INV_PILL_CLASS[ui]}>{t(`inv.status.${ui}`)}</Pill>
          {doc?.uae_e_invoice_status && (
            <Pill cls={EINVOICE_PILL[doc.uae_e_invoice_status] || "p-flat"}>{doc.uae_e_invoice_status}</Pill>
          )}
        </p>
      </PageHead>

      {(saveError || partyCall.error || submitCall.error || einvoiceCall.error || cancelCall.error) && (
        <ErrorBox error={saveError || partyCall.error || submitCall.error || einvoiceCall.error || cancelCall.error} />
      )}

      {submitted && doc?.uae_e_invoice_status && (
        <div className="alert"><b>{t("inv.eBanner")}</b><span>{doc.uae_e_invoice_status}</span></div>
      )}

      <div className="body2">
        <div>
          <Card num={1} title={t("inv.who")} hint={t("inv.whoHint")}>
            <div className="grid2">
              <Field label={t("f.customer")} required>
                <LinkField doctype={DT.customer} value={customer} onChange={setCustomer} disabled={locked} />
              </Field>
              <Field label={t("inv.date")} required>
                <input className="ctl" type="date" value={postingDate} disabled={locked}
                  onChange={(e) => setPostingDate(e.target.value)} />
              </Field>
              <Field label={t("inv.due")}>
                <input className="ctl" type="date" value={dueDate} disabled={locked}
                  onChange={(e) => setDueDate(e.target.value)} />
              </Field>
              <Field label={t("f.poNo")}>
                <input className="ctl" value={poNo} disabled={locked} onChange={(e) => setPoNo(e.target.value)} />
              </Field>
            </div>
            <div className="numblk">
              <span className="infochip"><span className="k2">T</span>{t("f.customerTrn")} <b>{party.tax_id || doc?.tax_id || "—"}</b></span>
              <span className="infochip"><span className="k2">C</span>{t("f.companyTrn")} <b>{companyDefaults.tax_id || doc?.company_trn || "—"}</b></span>
            </div>
          </Card>

          <Card num={2} title={t("soc.b2")} hint={t("soc.b2hint")}>
            <div className="grid2">
              <Field label={t("f.emirate")} required>
                <select className="ctl" value={emirate} disabled={locked} onChange={(e) => setEmirate(e.target.value)}>
                  <option value="" />
                  {UAE_EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
              <Field label={t("f.taxTemplate")}>
                <select className="ctl" value={taxTemplate} disabled={locked} onChange={(e) => setTaxTemplate(e.target.value)}>
                  <option value="" />
                  {(templates.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                </select>
              </Field>
              <Field label={t("f.paymentTerms")}>
                <select className="ctl" value={paymentTerms} disabled={locked} onChange={(e) => setPaymentTerms(e.target.value)}>
                  <option value="" />
                  {(terms.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                </select>
              </Field>
              {!!doc?.is_return && (
                <Field label={t("inv.reason")} required>
                  <input className="ctl" value={reason} disabled={locked} onChange={(e) => setReason(e.target.value)} />
                </Field>
              )}
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
                        {locked ? (l.item_name || l.item_code) : (
                          <LinkField doctype={DT.item} value={l.item_code} onChange={(v) => void pickItem(i, v)} />
                        )}
                      </td>
                      <td className="n">
                        <input className="ctl mini nn" style={{ width: 80 }} value={l.qty} disabled={locked}
                          onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty: parseNum(e.target.value) } : x))} />
                      </td>
                      <td className="n">
                        <input className="ctl mini nn" style={{ width: 104 }} value={l.rate} disabled={locked}
                          onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, rate: parseNum(e.target.value) } : x))} />
                      </td>
                      <td className="n" style={{ fontWeight: 600 }}>{money(l.qty * l.rate)}</td>
                      <td>
                        {!locked && (
                          <button className="rm" aria-label={t("inv.remove")}
                            onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!locked && (
              <div className="addrow">
                <button className="btn ghost sm" onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0 }])}>
                  ＋ {t("soc.addLine")}
                </button>
              </div>
            )}
          </Card>
        </div>
        <aside className="side">
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("inv.totals")}</h2>
            <SumRow k={t("sod.net")} v={money(doc?.net_total ?? net)} currency={currency} />
            <SumRow k={t("sod.vat")} v={money(doc?.total_taxes_and_charges ?? 0)} currency={currency} />
            <SumRow k={t("sod.grand")} v={money(doc?.grand_total ?? net)} cls="rule total" currency={currency} />
            {submitted && <SumRow k={t("inv.col.outstanding")} v={money(doc?.outstanding_amount)} cls="rule" currency={currency} />}
          </Card>
        </aside>
      </div>
    </>
  );
}
