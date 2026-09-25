/**
 * Purchase Order create/edit. Catalog txn helpers + get-items-from.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { linePayload, stampItemDetails, usePaymentSchedule, useTotalsPreview, useTransactionRpc, type PartyDetails, type TxnLine } from "../../lib/txn";
import { ExchangeRateField, LineTrack, PartyFields, PaymentScheduleTable } from "../../components/txnFields";
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

export default function PurchaseOrderForm() {
  const nav = useNavigate();
  const session = useSession();
  const canSubmit = canSubmitSales(session.roles);
  const { name: editName } = useParams<{ name?: string }>();
  const isEdit = !!editName;
  const company = session.company;

  const [supplier, setSupplier] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [requiredBy, setRequiredBy] = useState(plus(14));
  const [taxTemplate, setTaxTemplate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [party, setParty] = useState<PartyDetails>({});
  const [conversionRate, setConversionRate] = useState(1);
  const [lines, setLines] = useState<TxnLine[]>([]);
  const [skipReprice, setSkipReprice] = useState(false);

  type PoDoc = {
    name: string; supplier?: string; transaction_date?: string; schedule_date?: string;
    taxes_and_charges?: string; docstatus?: number; items?: TxnLine[];
  };
  const existing = useDoc<PoDoc>(DT.purchaseOrder, isEdit ? editName : undefined, isEdit ? editName : null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (isEdit && existing.data && !loaded) {
      const d = existing.data;
      if (d.docstatus !== 0) { nav(`/purchase-orders/${encodeURIComponent(editName!)}`, { replace: true }); return; }
      setSupplier(d.supplier ?? "");
      setOrderDate(d.transaction_date ?? today);
      setRequiredBy(d.schedule_date ?? plus(14));
      setTaxTemplate(d.taxes_and_charges ?? "");
      setLines((d.items ?? []).map((l) => ({
        item_code: l.item_code ?? "", item_name: l.item_name, uom: l.uom,
        qty: l.qty ?? 1, rate: l.rate ?? 0,
      })));
      setSkipReprice(true);
      setLoaded(true);
    }
  }, [isEdit, existing.data, loaded, nav, editName]);

  const templates = useDocList<{ name: string }>(DT.purchaseTaxTemplate, { fields: ["name"], limit: 50 });
  const termsList = useDocList<{ name: string }>(DT.paymentTerms, { fields: ["name"], limit: 50 });
  const txn = useTransactionRpc({ doctype: DT.purchaseOrder, side: "buying", company });
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall<{ message: { name: string } }>(METHOD.submit);
  const busy = create.loading || update.loading || submitCall.loading;

  useEffect(() => {
    if (!supplier) return;
    void txn.fetchParty(supplier, orderDate).then(async (m) => {
      if (!m) return;
      if (skipReprice) { setSkipReprice(false); return; }
      setParty(m);
      if (m.taxes_and_charges) setTaxTemplate(m.taxes_and_charges);
      if (m.payment_terms_template) setPaymentTerms(m.payment_terms_template);
      const cur = m.currency || session.currency || "";
      const rate = await txn.fetchExchangeRate(cur, session.currency || cur, orderDate);
      setConversionRate(rate);
      if (lines.some((l) => l.item_code)) {
        setLines(await txn.repriceLines({ party: m, lines, transactionDate: orderDate, currency: m.currency, conversionRate: rate, supplier }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, item_code } : l)));
    const m = await txn.fetchItem({
      item_code, supplier,
      buying_price_list: party.buying_price_list,
      currency: party.currency,
      transaction_date: orderDate,
      qty: lines[idx]?.qty || 1,
    });
    if (!m) return;
    setLines((ls) => ls.map((l, i) => (i === idx ? stampItemDetails({ ...l, item_code }, m) : l)));
  }

  function applyMapped(mapped: Record<string, unknown>) {
    setSkipReprice(true);
    if (mapped.supplier) setSupplier(String(mapped.supplier));
    if (mapped.transaction_date) setOrderDate(String(mapped.transaction_date));
    if (mapped.schedule_date) setRequiredBy(String(mapped.schedule_date));
    if (mapped.taxes_and_charges) setTaxTemplate(String(mapped.taxes_and_charges));
    const items = (mapped.items as TxnLine[] | undefined) ?? [];
    setLines(items.map((l) => ({
      item_code: l.item_code || "", item_name: l.item_name,
      qty: Number(l.qty) || 1, rate: Number(l.rate) || 0, uom: l.uom,
    })));
  }

  const buildPreviewDoc = useCallback(() => {
    if (!lines.some((l) => l.item_code)) return null;
    if (!supplier && !taxTemplate) return null;
    return {
      supplier,
      transaction_date: orderDate,
      schedule_date: requiredBy,
      company,
      taxes_and_charges: taxTemplate || undefined,
      supplier_address: party.supplier_address,
      buying_price_list: party.buying_price_list,
      currency: party.currency || session.currency,
      conversion_rate: conversionRate,
      items: lines.filter((l) => l.item_code).map((l) => ({
        item_code: l.item_code, qty: l.qty, rate: l.rate, uom: l.uom, schedule_date: requiredBy,
      })),
    };
  }, [supplier, orderDate, requiredBy, company, taxTemplate, party, session.currency, lines]);

  const { preview, previewing } = useTotalsPreview(
    buildPreviewDoc,
    [supplier, orderDate, taxTemplate, lines],
    txn.previewTotals,
  );

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const showNet = preview?.net_total ?? net;
  const showVat = preview?.total_taxes_and_charges ?? 0;
  const showGrand = preview?.grand_total ?? net;
  const schedule = usePaymentSchedule(
    paymentTerms || undefined,
    orderDate,
    showGrand,
    showGrand * (conversionRate || 1),
  );

  const checks = [
    [t("nav.suppliers"), !!supplier],
    [t("so.col.orderDate"), !!orderDate],
    [t("po.required"), !!requiredBy],
    [t("inv.lines"), lines.length > 0 && lines.every((l) => l.item_code)],
  ] as const;
  const ready = checks.every(([, ok]) => ok);

  async function save(shouldSubmit: boolean) {
    const doc = {
      supplier,
      transaction_date: orderDate,
      schedule_date: requiredBy,
      company,
      taxes_and_charges: taxTemplate || undefined,
      supplier_address: party.supplier_address,
      buying_price_list: party.buying_price_list,
      payment_terms_template: paymentTerms || undefined,
      currency: party.currency || session.currency,
      conversion_rate: conversionRate,
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
      items: lines.map((l) => ({ ...linePayload(l), schedule_date: requiredBy })),
    };
    let finalName: string;
    if (isEdit && editName) {
      await update.updateDoc(DT.purchaseOrder, editName, doc);
      finalName = editName;
    } else {
      const created = await create.createDoc(DT.purchaseOrder, doc) as { name: string };
      finalName = created.name;
    }
    if (shouldSubmit) {
      await submitCall.call({ doc: { doctype: DT.purchaseOrder, name: finalName } });
    }
    nav(`/purchase-orders/${encodeURIComponent(finalName)}`);
  }

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/purchase-orders")}>{t("nav.purchaseOrders")}</button>}
        title={t("po.new")}
        actions={
          <FormActions
            onDiscard={() => nav("/purchase-orders")}
            onSave={() => void save(false)}
            onSubmit={canSubmit ? () => void save(true) : undefined}
            busy={busy} ready={ready} submitLabel={t("soc.submit")}
          />
        }
      />
      {(txn.pricingError || create.error || submitCall.error || txn.partyCall.error) && (
        <ErrorBox error={txn.pricingError || create.error || submitCall.error || txn.partyCall.error} />
      )}
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
              title={t("soc.ready")} caption={t("soc.readyCap")}
            />
          </>
        }
      >
        {!isEdit && (
          <Card title={t("txn.getItemsFrom")}>
            <SourceDocPicker
              sources={[
                { label: t("nav.supplierQuotations"), doctype: DT.supplierQuotation, method: METHOD.makeSupplierQuotationPO, arg: "source_name" },
                { label: t("nav.materialRequests"), doctype: DT.materialRequest, method: METHOD.makeMrPO, arg: "source_name" },
              ]}
              onMapped={applyMapped}
            />
          </Card>
        )}
        <Card num={1} title={t("pi.who")}>
          <div className="grid2">
            <Field label={t("nav.suppliers")} required>
              <LinkField doctype={DT.supplier} value={supplier} onChange={setSupplier} />
            </Field>
            <Field label={t("pi.supplierTrn")}>
              <input className="ctl readonly" readOnly value={party.tax_id || ""} />
            </Field>
            <Field label={t("so.col.orderDate")} required htmlFor="po-order-date">
              <input id="po-order-date" name="transaction_date" className="ctl" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </Field>
            <Field label={t("po.required")} required htmlFor="po-required-by">
              <input id="po-required-by" name="schedule_date" className="ctl" type="date" value={requiredBy} onChange={(e) => setRequiredBy(e.target.value)} />
            </Field>
            <Field label={t("f.taxTemplate")} htmlFor="po-tax-template">
              <select id="po-tax-template" name="taxes_and_charges" className="ctl" value={taxTemplate} onChange={(e) => setTaxTemplate(e.target.value)} aria-label={t("f.taxTemplate")}>
                <option value="" />
                {(templates.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
              </select>
            </Field>
            <Field label={t("f.paymentTerms")}>
              <select className="ctl" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                <option value="" />
                {(termsList.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
              </select>
            </Field>
          </div>
          <PartyFields side="buying" partyName={supplier} party={party} onChange={(patch) => setParty((p) => ({ ...p, ...patch }))} />
          <div className="grid3" style={{ marginBlockStart: 14 }}>
            <ExchangeRateField currency={party.currency || session.currency || undefined} companyCurrency={session.currency || undefined} value={conversionRate} onChange={setConversionRate} />
          </div>
          <PaymentScheduleTable rows={schedule} />
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
                    <td style={{ minWidth: 220 }}>
                      <LinkField doctype={DT.item} value={l.item_code} onChange={(v) => void pickItem(i, v)} />
                      <LineTrack line={l} onChange={(patch) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, ...patch } : x))} />
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
