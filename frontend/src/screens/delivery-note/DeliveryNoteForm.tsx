/**
 * Delivery Note create/edit. Catalog txn helpers + get-items-from.
 * Routes: /delivery-notes/new, /delivery-notes/:name/edit
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales, canWrite } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { linePayload, stampItemDetails, useItemQtyCheck, useTotalsPreview, useTransactionRpc, type PartyDetails, type TxnLine } from "../../lib/txn";
import { ExchangeRateField, LineTrack, PartyFields } from "../../components/txnFields";
import { UAE_EMIRATES } from "../../types/uae";
import { t } from "../../i18n/strings";
import LinkField from "../../components/LinkField";
import SourceDocPicker from "../../components/SourceDocPicker";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";

type Line = TxnLine & { warehouse?: string; batch_no?: string; serial_no?: string };

const today = toIsoDate(new Date());

export default function DeliveryNoteForm() {
  const { name = "new" } = useParams();
  const isNew = name === "new";
  const editing = !isNew;
  const nav = useNavigate();
  const session = useSession();
  const canSubmit = canSubmitSales(session.roles);
  const company = session.company;

  const existing = useDoc<{
    name: string;
    customer?: string;
    posting_date?: string;
    set_warehouse?: string;
    taxes_and_charges?: string;
    vat_emirate?: string;
    docstatus?: number;
    items?: Line[];
  }>(DT.deliveryNote, isNew ? undefined : name, isNew ? null : name);

  const [customer, setCustomer] = useState("");
  const [postingDate, setPostingDate] = useState(today);
  const [warehouse, setWarehouse] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [emirate, setEmirate] = useState("");
  const [party, setParty] = useState<PartyDetails>({});
  const [conversionRate, setConversionRate] = useState(1);
  const [lines, setLines] = useState<Line[]>([{ item_code: "", qty: 1, rate: 0 }]);
  const [hydrated, setHydrated] = useState(!editing);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [skipReprice, setSkipReprice] = useState(false);

  const templates = useDocList<{ name: string }>(DT.taxTemplate, { fields: ["name"], limit: 50 });
  const txn = useTransactionRpc({ doctype: DT.deliveryNote, side: "selling", company });
  const stock = useItemQtyCheck(company);
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall<{ message: { name: string } }>(METHOD.submit);
  const busy = create.loading || update.loading || submitCall.loading;

  useEffect(() => {
    if (!editing || !existing.data || hydrated) return;
    const d = existing.data;
    setCustomer(d.customer || "");
    setPostingDate(d.posting_date || today);
    setWarehouse(d.set_warehouse || "");
    setTaxTemplate(d.taxes_and_charges || "");
    setEmirate(d.vat_emirate || "");
    setLines(
      (d.items ?? []).length
        ? (d.items ?? []).map((row) => ({
            item_code: row.item_code || "",
            item_name: row.item_name,
            uom: row.uom,
            qty: Number(row.qty) || 1,
            rate: Number(row.rate) || 0,
            warehouse: row.warehouse || d.set_warehouse || "",
            batch_no: row.batch_no || "",
            serial_no: row.serial_no || "",
          }))
        : [{ item_code: "", qty: 1, rate: 0 }],
    );
    setSkipReprice(true);
    setHydrated(true);
  }, [editing, existing.data, hydrated]);

  useEffect(() => {
    if (!customer) return;
    void txn.fetchParty(customer, postingDate).then(async (m) => {
      if (!m) return;
      if (skipReprice) { setSkipReprice(false); return; }
      setParty(m);
      if (m.taxes_and_charges) setTaxTemplate(m.taxes_and_charges);
      if (m.vat_emirate) setEmirate(m.vat_emirate);
      const cur = m.currency || session.currency || "";
      const rate = await txn.fetchExchangeRate(cur, session.currency || cur, postingDate);
      setConversionRate(rate);
      if (lines.some((l) => l.item_code)) {
        setLines(await txn.repriceLines({ party: m, lines, transactionDate: postingDate, currency: m.currency, conversionRate: rate, customer }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, item_code } : l)));
    if (!item_code) { void stock.checkLine(idx, "", 0); return; }
    const qty = lines[idx]?.qty || 1;
    const wh = lines[idx]?.warehouse || warehouse;
    const m = await txn.fetchItem({
      item_code, customer,
      selling_price_list: party.selling_price_list,
      currency: party.currency,
      transaction_date: postingDate,
      warehouse: wh,
      qty,
    });
    if (m) setLines((ls) => ls.map((l, i) => (i === idx ? stampItemDetails({ ...l, item_code }, m) : l)));
    void stock.checkLine(idx, item_code, qty, wh);
  }

  function applyMapped(mapped: Record<string, unknown>) {
    setSkipReprice(true);
    if (mapped.customer) setCustomer(String(mapped.customer));
    if (mapped.posting_date) setPostingDate(String(mapped.posting_date));
    if (mapped.set_warehouse) setWarehouse(String(mapped.set_warehouse));
    if (mapped.vat_emirate) setEmirate(String(mapped.vat_emirate));
    if (mapped.taxes_and_charges) setTaxTemplate(String(mapped.taxes_and_charges));
    const items = (mapped.items as Line[] | undefined) ?? [];
    setLines(
      items.map((l) => ({
        item_code: l.item_code || "",
        item_name: l.item_name,
        qty: Number(l.qty) || 1,
        rate: Number(l.rate) || 0,
        uom: l.uom,
        warehouse: l.warehouse || String(mapped.set_warehouse || ""),
        batch_no: l.batch_no,
        serial_no: l.serial_no,
      })),
    );
  }

  const buildPreviewDoc = useCallback(() => {
    if (!customer || !lines.some((l) => l.item_code)) return null;
    return {
      customer,
      posting_date: postingDate,
      set_warehouse: warehouse || undefined,
      company,
      vat_emirate: emirate || undefined,
      taxes_and_charges: taxTemplate || undefined,
      customer_address: party.customer_address,
      selling_price_list: party.selling_price_list,
      currency: party.currency || session.currency,
      conversion_rate: conversionRate,
      items: lines.filter((l) => l.item_code).map((l) => ({
        item_code: l.item_code, qty: l.qty, rate: l.rate, uom: l.uom,
        warehouse: l.warehouse || warehouse,
      })),
    };
  }, [customer, postingDate, warehouse, company, emirate, taxTemplate, party, session.currency, lines]);

  const { preview, previewing } = useTotalsPreview(
    buildPreviewDoc,
    [customer, postingDate, taxTemplate, emirate, lines],
    txn.previewTotals,
  );

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const showNet = preview?.net_total ?? net;
  const showVat = preview?.total_taxes_and_charges ?? 0;
  const showGrand = preview?.grand_total ?? net;

  const checks = [
    [t("dn.customer"), !!customer],
    [t("dn.date"), !!postingDate],
    [t("dn.warehouse"), !!warehouse],
    [t("f.emirate"), !!emirate],
    [t("f.taxTemplate"), !!taxTemplate],
    [t("dn.items"), lines.length > 0 && lines.every((l) => l.item_code)],
  ] as const;
  const ready = checks.every(([, ok]) => ok);

  if (!canWrite(session)) {
    return <ErrorBox error={new Error(t("team.denied"))} />;
  }
  if (editing && existing.isLoading && !hydrated) return <Loading />;
  if (editing && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (editing && existing.data && existing.data.docstatus !== 0) {
    return <Navigate to={`/delivery-notes/${encodeURIComponent(name)}`} replace />;
  }

  function buildBody() {
    return {
      customer,
      posting_date: postingDate,
      set_posting_time: 1,
      set_warehouse: warehouse,
      taxes_and_charges: taxTemplate || undefined,
      vat_emirate: emirate || undefined,
      customer_address: party.customer_address,
      selling_price_list: party.selling_price_list,
      company: company || undefined,
      currency: party.currency || session.currency || undefined,
      conversion_rate: conversionRate,
      shipping_address_name: party.shipping_address_name,
      contact_person: party.contact_person,
      items: lines.map((l) => ({ ...linePayload(l), warehouse: l.warehouse || warehouse || undefined })),
    };
  }

  async function save(shouldSubmit: boolean) {
    setSaveError(null);
    try {
      let docName = name;
      if (editing) {
        await update.updateDoc(DT.deliveryNote, name, buildBody());
      } else {
        const created = (await create.createDoc(DT.deliveryNote, buildBody())) as { name: string };
        docName = created.name;
      }
      if (shouldSubmit && docName) {
        await submitCall.call({ doc: { doctype: DT.deliveryNote, name: docName } });
      }
      nav(`/delivery-notes/${encodeURIComponent(docName)}`);
    } catch (err) {
      setSaveError(err);
    }
  }

  const err = saveError || txn.pricingError || create.error || update.error || submitCall.error || txn.partyCall.error;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet"
            onClick={() => nav(editing ? `/delivery-notes/${encodeURIComponent(name)}` : "/delivery-notes")}>
            {t("dn.listTitle")}
          </button>
        }
        title={editing ? t("dn.editTitle") : t("dn.newTitle")}
        actions={
          <FormActions
            onDiscard={() => nav(editing ? `/delivery-notes/${encodeURIComponent(name)}` : "/delivery-notes")}
            onSave={() => void save(false)}
            onSubmit={canSubmit ? () => void save(true) : undefined}
            busy={busy}
            ready={ready}
            submitLabel={t("inv.submit")}
          />
        }
      />
      {err && <ErrorBox error={err} />}
      <FormLayout
        aside={
          <>
            <Card bodyClass="cbody">
              <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>
                {t("dn.summary")}{previewing ? "…" : ""}
              </h2>
              <SumRow k={t("dn.net")} v={money(showNet)} />
              <SumRow k={t("sod.vat")} v={money(showVat)} />
              <SumRow k={t("sod.grand")} v={money(showGrand)} cls="rule total" />
            </Card>
            <ReadinessCard
              checks={checks.map(([label, ok]) => ({ label, ok }))}
              title={t("soc.ready")}
              caption={t("soc.readyCap")}
            />
          </>
        }
      >
        {isNew && (
          <Card title={t("txn.getItemsFrom")}>
            <SourceDocPicker
              sources={[
                { label: t("nav.salesOrders"), doctype: DT.salesOrder, method: METHOD.makeDeliveryNote, arg: "source_name" },
              ]}
              onMapped={applyMapped}
            />
          </Card>
        )}
        <Card num={1} title={t("dn.header")}>
          <div className="grid2">
            <Field label={t("dn.customer")} required>
              <LinkField doctype={DT.customer} value={customer} onChange={setCustomer} />
            </Field>
            <Field label={t("dn.customerTrn")}>
              <input className="ctl readonly" readOnly value={party.tax_id || ""} />
            </Field>
            <Field label={t("dn.date")} required htmlFor="dn-posting-date">
              <input id="dn-posting-date" name="posting_date" className="ctl" type="date"
                value={postingDate} onChange={(e) => setPostingDate(e.target.value)} />
            </Field>
            <Field label={t("dn.warehouse")} required>
              <LinkField doctype={DT.warehouse} value={warehouse} onChange={setWarehouse}
                filters={company ? [["company", "=", company], ["is_group", "=", 0]] : undefined} />
            </Field>
            <Field label={t("f.emirate")} required>
              <select className="ctl" value={emirate} onChange={(e) => setEmirate(e.target.value)}>
                <option value="" />
                {UAE_EMIRATES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </Field>
            <Field label={t("f.taxTemplate")} required>
              <select className="ctl" value={taxTemplate} onChange={(e) => setTaxTemplate(e.target.value)}>
                <option value="" />
                {(templates.data ?? []).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
              </select>
            </Field>
          </div>
          <PartyFields side="selling" partyName={customer} party={party} onChange={(patch) => setParty((p) => ({ ...p, ...patch }))} />
          <div className="grid3" style={{ marginBlockStart: 14 }}>
            <ExchangeRateField currency={party.currency || session.currency || undefined} companyCurrency={session.currency || undefined} value={conversionRate} onChange={setConversionRate} />
          </div>
        </Card>
        <Card num={2} title={t("dn.items")} bodyClass={null as unknown as string}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 26 }}>#</th>
                  <th>{t("dn.item")}</th>
                  <th>{t("dn.warehouse")}</th>
                  <th className="n">{t("dn.qty")}</th>
                  <th className="n">{t("dn.rate")}</th>
                  <th className="n">{t("dn.amount")}</th>
                  <th>{t("dn.batchNo")}</th>
                  <th>{t("dn.serialNo")}</th>
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
                    <td style={{ minWidth: 160 }}>
                      <LinkField doctype={DT.warehouse} value={l.warehouse ?? warehouse}
                        onChange={(v) => {
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, warehouse: v } : x)));
                          if (l.item_code) void stock.checkLine(i, l.item_code, l.qty, v || warehouse);
                        }}
                        filters={company ? [["company", "=", company], ["is_group", "=", 0]] : undefined} />
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                        onChange={(e) => {
                          const qty = parseNum(e.target.value);
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty } : x)));
                          if (l.item_code) void stock.checkLine(i, l.item_code, qty, l.warehouse || warehouse);
                        }}
                        aria-label={t("dn.qty")} />
                    </td>
                    <td className="n">
                      <input className="ctl mini nn" style={{ width: 104 }} value={l.rate}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, rate: parseNum(e.target.value) } : x)))}
                        aria-label={t("dn.rate")} />
                    </td>
                    <td className="n" style={{ fontWeight: 600 }}>{money(l.qty * l.rate)}</td>
                    <td style={{ minWidth: 100 }}>
                      <input className="ctl mini" placeholder="Batch" value={l.batch_no ?? ""}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, batch_no: e.target.value } : x))} />
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <input className="ctl mini" placeholder="SN" value={l.serial_no ?? ""}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, serial_no: e.target.value } : x))} />
                    </td>
                    <td>
                      <button type="button" className="rm" aria-label={t("dn.removeLine")}
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="addrow">
            <button type="button" className="btn ghost sm"
              onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0, warehouse }])}>
              {t("dn.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
