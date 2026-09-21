/**
 * Create a Purchase Order. Catalog insert then workflow.submit.
 * Importers: App.tsx /purchase-orders/new. Callers: PO list New.
 * Schema: supplier, transaction_date, schedule_date, taxes_and_charges, items.
 * User: "businesses will not be able to comfortably transact their business."
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDocList, useInsert } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";

type Line = { item_code: string; item_name?: string; uom?: string; qty: number; rate: number };
type Party = {
  supplier_address?: string;
  taxes_and_charges?: string;
  buying_price_list?: string;
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

export default function PurchaseOrderForm() {
  const nav = useNavigate();
  const session = useSession();
  const canSubmit = canSubmitSales(session.roles);

  const [supplier, setSupplier] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [requiredBy, setRequiredBy] = useState(plus(14));
  const [taxTemplate, setTaxTemplate] = useState("");
  const [party, setParty] = useState<Party>({});
  const [lines, setLines] = useState<Line[]>([]);

  const templates = useDocList<{ name: string }>(DT.purchaseTaxTemplate, { fields: ["name"], limit: 50 });
  const partyCall = useFrappePostCall<{ message: Party }>(METHOD.getPartyDetails);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);
  const create = useInsert();
  const submitCall = useFrappePostCall<{ message: { name: string } }>(METHOD.submit);
  const busy = create.loading || submitCall.loading;

  useEffect(() => {
    if (!supplier) return;
    partyCall
      .call({
        party: supplier,
        party_type: "Supplier",
        doctype: DT.purchaseOrder,
        company: session.company,
        posting_date: orderDate,
      })
      .then((r) => {
        const m = r?.message ?? {};
        setParty(m);
        if (m.taxes_and_charges) setTaxTemplate(m.taxes_and_charges);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, item_code } : l)));
    try {
      const r = await itemCall.call({
        ctx: {
          item_code,
          supplier,
          doctype: DT.purchaseOrder,
          company: session.company,
          buying_price_list: party.buying_price_list,
          currency: party.currency,
          transaction_date: orderDate,
          qty: 1,
        },
      });
      const m = (r?.message ?? {}) as Record<string, unknown>;
      setLines((ls) => ls.map((l, i) => i === idx ? {
        ...l,
        item_code,
        item_name: (m.item_name as string) ?? l.item_name,
        uom: (m.uom as string) ?? l.uom,
        rate: Number(m.price_list_rate ?? m.rate ?? l.rate) || l.rate,
      } : l));
    } catch { /* itemCall.error */ }
  }

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const checks = [
    [t("nav.suppliers"), !!supplier],
    [t("so.col.orderDate"), !!orderDate],
    [t("po.required"), !!requiredBy],
    [t("inv.lines"), lines.length > 0 && lines.every((l) => l.item_code)],
  ] as const;
  const ready = checks.every(([, ok]) => ok);

  async function save(shouldSubmit: boolean) {
    const created = await create.createDoc(DT.purchaseOrder, {
      supplier,
      transaction_date: orderDate,
      schedule_date: requiredBy,
      taxes_and_charges: taxTemplate || undefined,
      supplier_address: party.supplier_address,
      buying_price_list: party.buying_price_list,
      payment_terms_template: party.payment_terms_template,
      items: lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        schedule_date: requiredBy,
      })),
    }) as { name: string };
    if (shouldSubmit) {
      await submitCall.call({ doc: { doctype: DT.purchaseOrder, name: created.name } });
    }
    nav(`/purchase-orders/${encodeURIComponent(created.name)}`);
  }

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/purchase-orders")}>
            {t("nav.purchaseOrders")}
          </button>
        }
        title={t("po.new")}
        actions={
          <FormActions
            onDiscard={() => nav("/purchase-orders")}
            onSave={() => void save(false)}
            onSubmit={canSubmit ? () => void save(true) : undefined}
            busy={busy}
            ready={ready}
            submitLabel={t("soc.submit")}
          />
        }
      />
      {(create.error || submitCall.error || partyCall.error) && (
        <ErrorBox error={create.error || submitCall.error || partyCall.error} />
      )}
      <FormLayout
        aside={
          <>
            <Card bodyClass="cbody">
              <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("soc.summary")}</h2>
              <SumRow k={t("sod.net")} v={money(net)} />
            </Card>
            <ReadinessCard
              checks={checks.map(([label, ok]) => ({ label, ok }))}
              title={t("soc.ready")}
              caption={t("soc.readyCap")}
            />
          </>
        }
      >
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
            <button type="button" className="btn ghost sm"
              onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0 }])}>
              ＋ {t("soc.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
