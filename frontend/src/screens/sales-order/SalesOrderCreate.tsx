/**
 * Sales Order create/edit. Catalog txn helpers + get-items-from.
 * Routes: /orders/new, /orders/:name/edit
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { linePayload, stampItemDetails, useCreditBalance, useItemQtyCheck, usePaymentSchedule, useTotalsPreview, useTransactionRpc, type PartyDetails, type TxnLine } from "../../lib/txn";
import { CreditLimitNotice, ExchangeRateField, LineTrack, PartyFields, PaymentScheduleTable } from "../../components/txnFields";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";
import SourceDocPicker from "../../components/SourceDocPicker";

const today = toIsoDate(new Date());
const plus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
};

type SoDoc = {
  name: string;
  customer?: string;
  transaction_date?: string;
  delivery_date?: string;
  po_no?: string;
  taxes_and_charges?: string;
  vat_emirate?: string;
  conversion_rate?: number;
  docstatus?: number;
  items?: TxnLine[];
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
  const [lines, setLines] = useState<TxnLine[]>([]);
  const [conversionRate, setConversionRate] = useState(1);
  const [paymentTerms, setPaymentTerms] = useState("");
  const [skipReprice, setSkipReprice] = useState(false);

  const existing = useDoc<SoDoc>(DT.salesOrder, isEdit ? editName : undefined, isEdit ? editName : null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (isEdit && existing.data && !loaded) {
      const d = existing.data;
      if (d.docstatus !== 0) {
        nav(`/orders/${encodeURIComponent(editName!)}`, { replace: true });
        return;
      }
      setCustomer(d.customer ?? "");
      setOrderDate(d.transaction_date ?? today);
      setDeliveryDate(d.delivery_date ?? plus(21));
      setPoNo(d.po_no ?? "");
      setTaxTemplate(d.taxes_and_charges ?? "");
      setEmirate(d.vat_emirate ?? "");
      setConversionRate(Number(d.conversion_rate) || 1);
      setLines(
        (d.items ?? []).map((l) => ({
          item_code: l.item_code ?? "",
          item_name: l.item_name,
          uom: l.uom,
          qty: l.qty ?? 1,
          rate: l.rate ?? 0,
        })),
      );
      setSkipReprice(true);
      setLoaded(true);
    }
  }, [isEdit, existing.data, loaded, nav, editName]);

  const taxTemplates = useDocList<{ name: string }>(DT.taxTemplate, { fields: ["name"], limit: 50 });
  const termsList = useDocList<{ name: string }>(DT.paymentTerms, { fields: ["name"], limit: 50 });
  const company = session.company;
  const txn = useTransactionRpc({ doctype: DT.salesOrder, side: "selling", company });
  const stock = useItemQtyCheck(company);

  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall<{ message: { name: string } }>(METHOD.submit);
  const busy = create.loading || update.loading || submitCall.loading;

  useEffect(() => {
    if (!customer) return;
    void txn.fetchParty(customer, orderDate).then(async (m) => {
      if (!m) return;
      if (skipReprice) {
        setSkipReprice(false);
        return;
      }
      setParty(m);
      if (m.taxes_and_charges) setTaxTemplate(m.taxes_and_charges);
      if (m.vat_emirate) setEmirate(m.vat_emirate);
      if (m.payment_terms_template) setPaymentTerms(m.payment_terms_template);
      const cur = m.currency || session.currency || "";
      const rate = await txn.fetchExchangeRate(cur, session.currency || cur, orderDate);
      setConversionRate(rate);
      if (lines.some((l) => l.item_code)) {
        const next = await txn.repriceLines({
          party: m,
          lines,
          transactionDate: orderDate,
          currency: m.currency,
          conversionRate: rate,
          customer,
        });
        setLines(next);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, item_code } : l)));
    if (!item_code) { void stock.checkLine(idx, "", 0); return; }
    const qty = lines[idx]?.qty || 1;
    const m = await txn.fetchItem({
      item_code,
      customer,
      currency: party.currency || session.currency,
      selling_price_list: party.selling_price_list,
      transaction_date: orderDate,
      qty,
    });
    if (m) setLines((ls) => ls.map((l, i) => (i === idx ? stampItemDetails({ ...l, item_code }, m) : l)));
    void stock.checkLine(idx, item_code, qty);
  }

  function applyMapped(mapped: Record<string, unknown>) {
    setSkipReprice(true);
    if (mapped.customer) setCustomer(String(mapped.customer));
    if (mapped.transaction_date) setOrderDate(String(mapped.transaction_date));
    if (mapped.delivery_date) setDeliveryDate(String(mapped.delivery_date));
    if (mapped.vat_emirate) setEmirate(String(mapped.vat_emirate));
    if (mapped.taxes_and_charges) setTaxTemplate(String(mapped.taxes_and_charges));
    if (mapped.po_no) setPoNo(String(mapped.po_no));
    const items = (mapped.items as TxnLine[] | undefined) ?? [];
    setLines(
      items.map((l) => ({
        item_code: l.item_code || "",
        item_name: l.item_name,
        qty: Number(l.qty) || 1,
        rate: Number(l.rate) || 0,
        uom: l.uom,
      })),
    );
  }

  const buildPreviewDoc = useCallback(() => {
    if (!customer || !lines.some((l) => l.item_code)) return null;
    return {
      customer,
      transaction_date: orderDate,
      delivery_date: deliveryDate,
      company,
      vat_emirate: emirate || undefined,
      taxes_and_charges: taxTemplate || undefined,
      customer_address: party.customer_address,
      selling_price_list: party.selling_price_list,
      currency: party.currency || session.currency,
      conversion_rate: conversionRate,
      shipping_address_name: party.shipping_address_name,
      contact_person: party.contact_person,
      items: lines.filter((l) => l.item_code).map((l) => ({ ...linePayload(l), delivery_date: deliveryDate })),
    };
  }, [customer, orderDate, deliveryDate, company, emirate, taxTemplate, party, session.currency, lines]);

  const { preview, previewing } = useTotalsPreview(
    buildPreviewDoc,
    [customer, orderDate, taxTemplate, emirate, lines],
    txn.previewTotals,
  );

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const showNet = preview?.net_total ?? net;
  const showVat = preview?.total_taxes_and_charges ?? 0;
  const showGrand = preview?.grand_total ?? net;
  const schedule = usePaymentSchedule(paymentTerms || undefined, orderDate, showGrand, showGrand * (conversionRate || 1));
  const credit = useCreditBalance(customer || undefined, company, showGrand * (conversionRate || 1));

  const checks = [
    [t("soc.k1"), !!customer],
    [t("soc.k2"), !!orderDate],
    [t("soc.k3"), !!deliveryDate],
    [t("soc.k4"), lines.length > 0 && lines.every((l) => l.item_code)],
    [t("soc.k5"), !!taxTemplate],
    [t("soc.k6"), !!emirate],
    [t("f.conversionRate"), !party.currency || party.currency === session.currency || conversionRate > 0],
  ] as const;
  const ready = checks.every(([, ok]) => ok);

  async function save(shouldSubmit: boolean) {
    const doc = {
      customer,
      transaction_date: orderDate,
      delivery_date: deliveryDate,
      po_no: poNo || undefined,
      company,
      taxes_and_charges: taxTemplate || undefined,
      vat_emirate: emirate || undefined,
      customer_address: party.customer_address,
      selling_price_list: party.selling_price_list,
      payment_terms_template: paymentTerms || party.payment_terms_template,
      currency: party.currency || session.currency,
      conversion_rate: conversionRate,
      shipping_address_name: party.shipping_address_name,
      contact_person: party.contact_person,
      payment_schedule: schedule.length
        ? schedule.map((r) => ({
            payment_term: r.payment_term,
            description: r.description,
            due_date: r.due_date,
            invoice_portion: r.invoice_portion,
            payment_amount: r.payment_amount,
            mode_of_payment: r.mode_of_payment,
          }))
        : undefined,
      items: lines.map((l) => ({ ...linePayload(l), delivery_date: deliveryDate })),
    };
    let finalName: string;
    if (isEdit && editName) {
      await update.updateDoc(DT.salesOrder, editName, doc);
      finalName = editName;
    } else {
      const created = (await create.createDoc(DT.salesOrder, doc)) as { name: string };
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
          <FormActions
            onDiscard={() => nav("/orders")}
            onSave={() => void save(false)}
            onSubmit={() => void save(true)}
            busy={busy}
            ready={ready}
            submitLabel={t("soc.submit")}
          />
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 7 }}>
          <span className="pill p-draft">{t("status.Draft")}</span>
          <span className="pill p-flat">{t("soc.promise")}</span>
        </p>
      </PageHead>

      {create.error && <ErrorBox error={create.error} />}
      {submitCall.error && <ErrorBox error={submitCall.error} />}
      {txn.pricingError && <ErrorBox error={txn.pricingError} />}
      {txn.partyCall.error && <ErrorBox error={txn.partyCall.error} />}

      <FormLayout
        aside={
          <>
            <Card bodyClass="cbody">
              <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>
                {t("soc.summary")}{previewing ? "…" : ""}
              </h2>
              <SumRow k={t("sod.net")} v={money(showNet)} />
              <SumRow k={t("sod.vat")} v={money(showVat)} />
              <SumRow k={t("sod.grand")} v={money(showGrand)} cls="rule total" />
            </Card>

            <ReadinessCard
              checks={checks.map(([label, ok]) => ({ label, ok }))}
              title={t("soc.ready")}
              caption={t("soc.readyCap")}
            />

            <div className="note">
              <svg className="ic" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="8" cy="8" r="6.5" /><path d="M8 7.5v4M8 4.8v.6" />
              </svg>
              <span><b>{t("soc.noteTitle")}</b><span>{t("soc.noteBody")}</span></span>
            </div>
          </>
        }
      >
        {!isEdit && (
          <Card title={t("txn.getItemsFrom")}>
            <SourceDocPicker
              sources={[
                { label: t("nav.quotations"), doctype: DT.quotation, method: METHOD.makeQuotationSO, arg: "source_name" },
              ]}
              onMapped={applyMapped}
            />
          </Card>
        )}

        <Card num={1} title={t("soc.b1")}>
          <div className="grid2">
            <Field label={t("f.customer")} required>
              <LinkField doctype={DT.customer} value={customer} onChange={setCustomer} />
            </Field>
            <Field label={t("f.currency")}>
              <span className="ctl readonly">{party.currency || session.currency || "—"}</span>
            </Field>
          </div>
          <PartyFields side="selling" partyName={customer} party={party} onChange={(patch) => setParty((p) => ({ ...p, ...patch }))} />
          <div className="grid3" style={{ marginBlockStart: 14 }}>
            <ExchangeRateField
              currency={party.currency || session.currency || undefined}
              companyCurrency={session.currency || undefined}
              value={conversionRate}
              onChange={setConversionRate}
            />
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
            <Field label={t("f.paymentTerms")}>
              <select className="ctl" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                <option value="" />
                {(termsList.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
              </select>
            </Field>
          </div>
          <PaymentScheduleTable rows={schedule} />
          <CreditLimitNotice balance={credit} />
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
                      <LinkField doctype={DT.item} value={l.item_code} onChange={(v) => void pickItem(i, v)} />
                      <LineTrack line={l} onChange={(patch) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, ...patch } : x))} />
                      {stock.hints[i] ? (
                        <div style={{ fontSize: 11, color: "var(--warn, #b45309)", marginTop: 4 }}>
                          {t("txn.stockLow")
                            .replace("{avail}", String(stock.hints[i].avail))
                            .replace("{qty}", String(stock.hints[i].qty))}
                        </div>
                      ) : null}
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                        onChange={(e) => {
                          const qty = parseNum(e.target.value);
                          setLines((ls) => ls.map((x, j) => j === i ? { ...x, qty } : x));
                          if (l.item_code) void stock.checkLine(i, l.item_code, qty);
                        }} />
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
