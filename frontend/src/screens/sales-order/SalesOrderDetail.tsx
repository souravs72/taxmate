import { useNavigate, useParams } from "react-router-dom";
import { useFrappeGetDoc, useFrappeGetDocList, useFrappePostCall } from "frappe-react-sdk";

import type { SalesOrder, SalesOrderItem } from "../../types/erpnext";
import { DT, METHOD } from "../../lib/frappe";
import { date, money, pct, qty } from "../../lib/format";
import { SO_PILL_CLASS, isLate, toUiStatus } from "../../lib/status";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, MiniBar, PageHead, Pill, ReadRow, SumRow } from "../../components/ui";

type Doc = SalesOrder & { items: SalesOrderItem[] };

export default function SalesOrderDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();

  const { data, error, isLoading, mutate } = useFrappeGetDoc<Doc>(DT.salesOrder, name);

  /* Delivery notes that reference this order. The link lives on the child
     table, so filter the child doctype and read its parent.               */
  const dns = useFrappeGetDocList<{ parent: string; qty: number }>(DT.deliveryNoteItem, {
    fields: ["parent", "qty"],
    filters: [["against_sales_order", "=", name]],
    limit: 50,
  });
  const invs = useFrappeGetDocList<{ parent: string; amount: number }>(DT.salesInvoiceItem, {
    fields: ["parent", "amount"],
    filters: [["sales_order", "=", name]],
    limit: 50,
  });

  /* Both mappers return an UNSAVED document — verified in ERPNext v16
     (sales_order.py:1345, :1561). We take it and create it in a second step. */
  const makeDn = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeDeliveryNote);
  const makeSi = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.makeSalesInvoice);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  const ui = toUiStatus(data.status);
  const late = isLate(data);
  const vat = data.total_taxes_and_charges ?? 0;
  const net = data.net_total ?? 0;
  const grand = data.grand_total ?? 0;
  const advance = data.advance_paid ?? 0;

  const parents = (rows: { parent: string }[] | undefined) =>
    Array.from(new Set((rows ?? []).map((r) => r.parent)));

  return (
    <>
      <PageHead
        eyebrow={
          <>
            <a onClick={() => nav("/orders")} style={{ color: "var(--brand)", cursor: "pointer" }}>
              {t("nav.salesOrders")}
            </a>{" / "}{data.name}
          </>
        }
        title={data.customer_name || data.customer}
        actions={
          <>
            <button className="btn ghost" disabled={makeDn.loading}
              onClick={() => makeDn.call({ source_name: name })}>
              {t("sod.createDn")}
            </button>
            <button className="btn" disabled={makeSi.loading}
              onClick={() => makeSi.call({ source_name: name })}>
              {t("sod.createSi")}
            </button>
          </>
        }
      >
        <p className="sub" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 7 }}>
          <Pill cls={SO_PILL_CLASS[ui]}>{t(`status.${ui}`)}</Pill>
          {late && <Pill cls="p-overdue">{t("so.late")}</Pill>}
          {data.po_no && <span className="pill p-flat">PO · {data.po_no}</span>}
        </p>
      </PageHead>

      {(makeDn.error || makeSi.error) && <ErrorBox error={makeDn.error ?? makeSi.error} />}

      <Card bodyClass="steps">
        <Step colour="var(--c-draft)" mark="✓" name={t("stage.draft")} value={date(data.transaction_date)} pctv={100} />
        <Step colour="var(--c-confirmed)" mark={data.docstatus === 1 ? "✓" : "○"} name={t("stage.confirmed")}
          value={data.docstatus === 1 ? date(data.transaction_date) : "—"} pctv={data.docstatus === 1 ? 100 : 0} />
        <Step colour="var(--c-delivered)" mark="◐" name={t("stage.delivered")}
          value={pct(data.per_delivered)} pctv={data.per_delivered ?? 0} />
        <Step colour="var(--c-billed)" mark="◔" name={t("stage.billed")}
          value={pct(data.per_billed)} pctv={data.per_billed ?? 0} />
      </Card>

      <div className="body2">
        <div>
          <Card title={t("sod.details")} hint={t("sod.detailsHint")}>
            <div className="fg">
              <ReadRow k={t("f.customer")} v={data.customer_name || data.customer} link />
              <ReadRow k={t("f.customerTrn")} v={<span className="mono">{data.tax_id || "—"}</span>} />
              <ReadRow k={t("f.address")} v={data.customer_address || "—"} />
              <ReadRow k={t("f.orderDate")} v={date(data.transaction_date)} />
              <ReadRow k={t("f.deliveryDate")} v={date(data.delivery_date)} />
              <ReadRow k={t("f.paymentTerms")} v={data.payment_terms_template || "—"} />
              <ReadRow k={t("f.taxTemplate")} v={data.taxes_and_charges || "—"} />
              <ReadRow k={t("f.emirate")} v={(data as unknown as Record<string, string>).vat_emirate || "—"} />
              <ReadRow k={t("f.priceList")} v={data.selling_price_list || "—"} />
            </div>
          </Card>

          <Card title={t("sod.items")} hint={`${data.items?.length ?? 0} · ${t("sod.itemsHint")}`}
                bodyClass="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("soc.pickItem")}</th>
                  <th className="n">{t("sod.col.qty")}</th>
                  <th className="n">{t("sod.col.rate")}</th>
                  <th className="n">{t("sod.col.amount")}</th>
                  <th>{t("so.bar.delivered")}</th>
                  <th className="n">{t("sod.col.remaining")}</th>
                </tr>
              </thead>
              <tbody>
                {(data.items ?? []).map((l, i) => {
                  const delivered = l.delivered_qty ?? 0;
                  const ordered = l.qty ?? 0;
                  const remaining = Math.max(0, ordered - delivered);
                  const p = ordered ? (delivered / ordered) * 100 : 0;
                  return (
                    <tr key={l.name ?? i}>
                      <td style={{ color: "var(--faint)", fontSize: 11.5, textAlign: "center" }}>{i + 1}</td>
                      <td>
                        <div className="icode">{l.item_code}</div>
                        <div className="iname">{l.item_name}</div>
                      </td>
                      <td className="n">{qty(ordered)}<div style={{ fontSize: 11, color: "var(--faint)" }}>{l.uom}</div></td>
                      <td className="n">{money(l.rate)}</td>
                      <td className="n" style={{ fontWeight: 600 }}>{money(l.amount)}</td>
                      <td>
                        <div className="prog">
                          <div className="row1">
                            <span className="a">{pct(p)}</span>
                            <span className="b">{qty(delivered)} / {qty(ordered)}</span>
                          </div>
                          <MiniBar value={p} colour="var(--c-delivered)" />
                        </div>
                      </td>
                      <td className={`n rem ${remaining === 0 ? "zero" : "open"}`}>
                        {remaining === 0 ? "—" : `${qty(remaining)} ${l.uom ?? ""}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="n">{t("sod.net")}</td>
                  <td className="n">{money(net)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>

        <aside className="side">
          <Card bodyClass="cbody">
            <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("sod.value")}</h2>
            <SumRow k={t("sod.net")} v={money(net)} />
            <SumRow k={t("sod.vat")} v={money(vat)} />
            <SumRow k={t("sod.grand")} v={money(grand)} cls="rule total" />
            {advance > 0 && <SumRow k={t("sod.advance")} v={money(advance)} cls="rule" />}
          </Card>

          <Card title={t("sod.linked")} bodyClass="cbody">
            {parents(dns.data).map((p) => <div key={p} className="mono" style={{ fontSize: 12 }}>{p}</div>)}
            {parents(invs.data).map((p) => <div key={p} className="mono" style={{ fontSize: 12 }}>{p}</div>)}
            {parents(dns.data).length + parents(invs.data).length === 0 && (
              <span style={{ fontSize: 12.5, color: "var(--faint)" }}>—</span>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}

function Step({ colour, mark, name, value, pctv }: {
  colour: string; mark: string; name: string; value: string; pctv: number;
}) {
  return (
    <div className="step">
      <div className="top">
        <span className="dot" style={{ background: colour }}>{mark}</span>
        <span className="nm">{name}</span>
      </div>
      <span className="val">{value}</span>
      <div className="sbar"><i style={{ width: `${pctv}%`, background: colour }} /></div>
    </div>
  );
}
