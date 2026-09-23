import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";

type Line = {
  item_code: string;
  item_name?: string;
  uom?: string;
  qty: number;
  rate: number;
};

type PartyDetails = {
  customer_address?: string;
  taxes_and_charges?: string;
  selling_price_list?: string;
  payment_terms_template?: string;
  tax_id?: string;
  currency?: string;
};

const today = toIsoDate(new Date());
const plus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
};

export default function SalesOrderCreate() {
  const nav = useNavigate();
  const session = useSession();
  const { name: editName } = useParams<{ name?: string }>();
  const isEdit = !!editName;

  const [customer, setCustomer] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [deliveryDate, setDeliveryDate] = useState(plus(21));
  const [poNo, setPoNo] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [emirate, setEmirate] = useState("");
  const [party, setParty] = useState<PartyDetails>({});
  const [lines, setLines] = useState<Line[]>([]);

  /* Load existing doc when in edit mode */
  type SoDoc = { name: string; customer?: string; transaction_date?: string; delivery_date?: string; po_no?: string; taxes_and_charges?: string; vat_emirate?: string; docstatus?: number; items?: (Line & { name?: string })[]; };
  const existing = useDoc<SoDoc>(DT.salesOrder, isEdit ? editName : undefined, isEdit ? editName : null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (isEdit && existing.data && !loaded) {
      const d = existing.data;
      if (d.docstatus !== 0) { nav(`/orders/${encodeURIComponent(editName!)}`, { replace: true }); return; }
      setCustomer(d.customer ?? "");
      setOrderDate(d.transaction_date ?? today);
      setDeliveryDate(d.delivery_date ?? plus(21));
      setPoNo(d.po_no ?? "");
      setTaxTemplate(d.taxes_and_charges ?? "");
      setEmirate(d.vat_emirate ?? "");
      setLines((d.items ?? []).map((l) => ({ item_code: l.item_code ?? "", item_name: l.item_name, uom: l.uom, qty: l.qty ?? 1, rate: l.rate ?? 0 })));
      setLoaded(true);
    }
  }, [isEdit, existing.data, loaded, nav, editName]);

  const customers = useDocList<{ name: string; customer_name: string }>(DT.customer, {
    fields: ["name", "customer_name"],
    orderBy: { field: "customer_name", order: "asc" },
    limit: 500,
  });

  const items = useDocList<{ name: string; item_name: string; stock_uom: string }>(DT.item, {
    fields: ["name", "item_name", "stock_uom"],
    filters: [["disabled", "=", 0]],
    orderBy: { field: "modified", order: "desc" },
    limit: 500,
  });

  const taxTemplates = useDocList<{ name: string }>("Sales Taxes and Charges Template", {
    fields: ["name"],
    limit: 50,
  });

  /* erpnext/accounts/party.py:77 — pass doctype so the Sales Order branch
     runs. It does NOT return debit_to/due_date for orders; that's invoices. */
  const partyCall = useFrappePostCall<{ message: PartyDetails }>(METHOD.partyDetails);
  /* erpnext/stock/get_item_details.py:85 — takes a ctx dict, not flat kwargs,
     and does NOT return delivery_date. We set that ourselves.               */
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.itemDetails);

  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall<{ message: { name: string } }>(METHOD.submit);
  const busy = create.loading || update.loading || submitCall.loading;

  useEffect(() => {
    if (!customer) return;
    partyCall
      .call({
        party: customer,
        party_type: "Customer",
        doctype: DT.salesOrder,
        posting_date: orderDate,
      })
      .then((r) => {
        const m = r?.message ?? {};
        setParty(m);
        if (m.taxes_and_charges) setTaxTemplate(m.taxes_and_charges);
      })
      .catch(() => { /* surfaced by partyCall.error */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  async function pickItem(idx: number, item_code: string) {
    const meta = items.data?.find((i) => i.name === item_code);
    setLines((ls) => ls.map((l, i) =>
      i === idx ? { ...l, item_code, item_name: meta?.item_name, uom: meta?.stock_uom } : l));
    try {
      const r = await itemCall.call({
        ctx: {
          item_code,
          customer,
          doctype: DT.salesOrder,
          company: session.company,
          selling_price_list: party.selling_price_list,
          currency: party.currency,
          transaction_date: orderDate,
          qty: 1,
        },
      });
      const m = (r?.message ?? {}) as Record<string, unknown>;
      setLines((ls) => ls.map((l, i) => i === idx ? {
        ...l,
        item_name: (m.item_name as string) ?? l.item_name,
        uom: (m.uom as string) ?? l.uom,
        rate: Number(m.price_list_rate ?? m.rate ?? l.rate) || l.rate,
      } : l));
    } catch { /* surfaced by itemCall.error */ }
  }

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);

  const checks = [
    [t("soc.k1"), !!customer],
    [t("soc.k2"), !!orderDate],
    [t("soc.k3"), !!deliveryDate],
    [t("soc.k4"), lines.length > 0 && lines.every((l) => l.item_code)],
    [t("soc.k5"), !!taxTemplate],
  ] as const;
  const done = checks.filter(([, ok]) => ok).length;

  async function save(shouldSubmit: boolean) {
    /* Always insert as draft. Confirm Order then calls workflow.submit so
       ERPNext runs set_status (insert with docstatus:1 leaves status=Draft). */
    const doc = {
      customer,
      transaction_date: orderDate,
      delivery_date: deliveryDate,
      po_no: poNo || undefined,
      taxes_and_charges: taxTemplate || undefined,
      vat_emirate: emirate || undefined,
      customer_address: party.customer_address,
      selling_price_list: party.selling_price_list,
      payment_terms_template: party.payment_terms_template,
      items: lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        delivery_date: deliveryDate,
      })),
    };
    let finalName: string;
    if (isEdit && editName) {
      await update.updateDoc(DT.salesOrder, editName, doc);
      finalName = editName;
    } else {
      const created = await create.createDoc(DT.salesOrder, doc) as { name: string };
      finalName = created.name;
    }
    if (shouldSubmit) {
      await submitCall.call({ doc: { doctype: DT.salesOrder, name: finalName } });
    }
    nav(`/orders/${encodeURIComponent(finalName)}`);
  }

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/orders")}>{t("nav.salesOrders")}</button>}
        title={t("soc.title")}
        actions={
          <>
            <FormActions
              onDiscard={() => nav("/orders")}
              onSave={() => save(false)}
              onSubmit={() => save(true)}
              busy={busy} ready={done >= 5} submitLabel={t("soc.submit")} />
          </>
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7 }}>
          <span className="pill p-draft">{t("status.Draft")}</span>
          <span className="pill p-flat">{t("soc.promise")}</span>
        </p>
      </PageHead>

      {create.error && <ErrorBox error={create.error} />}
      {submitCall.error && <ErrorBox error={submitCall.error} />}
      {partyCall.error && <ErrorBox error={partyCall.error} />}

      <FormLayout aside={
        <>
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("soc.summary")}</h2>
            <SumRow k={t("sod.net")} v={money(net)} />
            <p style={{ margin: "10px 0 0", fontSize: 11.5, color: "var(--faint)" }}>
              VAT and grand total are calculated by the server on save.
            </p>
          </Card>

          <ReadinessCard
            checks={checks.map(([label, ok]) => ({ label, ok }))}
            title={t("soc.ready")} caption={t("soc.readyCap")} />

          <div className="note">
            <svg className="ic" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="8" cy="8" r="6.5" /><path d="M8 7.5v4M8 4.8v.6" />
            </svg>
            <span><b>{t("soc.noteTitle")}</b><span>{t("soc.noteBody")}</span></span>
          </div>
        </>
      }>
          <Card num={1} title={t("soc.b1")}>
            <div className="grid2">
              <Field label={t("f.customer")} required>
                <select className="ctl" value={customer} onChange={(e) => setCustomer(e.target.value)}>
                  <option value="" />
                  {(customers.data ?? []).map((c) => (
                    <option key={c.name} value={c.name}>{c.customer_name || c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label={t("f.address")}>
                <input className="ctl readonly" readOnly value={party.customer_address ?? ""} />
              </Field>
            </div>
            <div className="grid3" style={{ marginBlockStart: 14 }}>
              <Field label={t("f.orderDate")} required>
                <input className="ctl" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </Field>
              <Field label={t("f.deliveryDate")} required>
                <input className="ctl" type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
              </Field>
              <Field label={t("f.poNo")}>
                <input className="ctl" value={poNo} onChange={(e) => setPoNo(e.target.value)} />
              </Field>
            </div>
            <div className="numblk">
              <span className="infochip"><span className="k2">T</span>{t("f.customerTrn")} <b>{party.tax_id ?? "—"}</b></span>
              <span className="infochip"><span className="k2">P</span>{t("f.priceList")} <b>{party.selling_price_list ?? "—"}</b></span>
            </div>
          </Card>

          <Card num={2} title={t("soc.b2")}>
            <div className="grid3">
              <Field label={t("f.taxTemplate")} required>
                <select className="ctl" value={taxTemplate} onChange={(e) => setTaxTemplate(e.target.value)}>
                  <option value="" />
                  {(taxTemplates.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                </select>
              </Field>
              <Field label={t("f.emirate")} required>
                <select className="ctl" value={emirate} onChange={(e) => setEmirate(e.target.value)}>
                  <option value="" />
                  {UAE_EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
            </div>
          </Card>

          <Card num={3} title={t("soc.b3")} bodyClass={null as unknown as string}>
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
                        <select className="ctl mini" value={l.item_code} onChange={(e) => pickItem(i, e.target.value)}>
                          <option value="" />
                          {(items.data ?? []).map((it) => (
                            <option key={it.name} value={it.name}>{it.name} · {it.item_name}</option>
                          ))}
                        </select>
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
              <button className="btn ghost sm"
                onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0 }])}>
                {t("soc.addLine")}
              </button>
            </div>
          </Card>
      </FormLayout>
    </>
  );
}
