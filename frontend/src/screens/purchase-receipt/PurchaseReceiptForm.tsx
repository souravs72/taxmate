/**
 * Purchase Receipt create/edit.
 * Callers: App.tsx import ~L62; routes /purchase-receipts/new and /:name/edit;
 * PurchaseReceiptDetail navigates to /edit for drafts.
 * Existing create-only form is replaced here for edit support (no separate file).
 * Schema: { supplier, posting_date YYYY-MM-DD, set_warehouse, items:[{item_code, qty, rate, uom, warehouse}] }
 * User: "Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself. … Don't stop until you have completed all the to-dos."
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales, canWrite } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";

type Line = { item_code: string; item_name?: string; uom?: string; qty: number; rate: number; warehouse?: string; batch_no?: string; serial_no?: string };
type Party = {
  supplier_address?: string;
  taxes_and_charges?: string;
  buying_price_list?: string;
  tax_id?: string;
  currency?: string;
};

const today = toIsoDate(new Date());

export default function PurchaseReceiptForm() {
  const { name = "new" } = useParams();
  const isNew = name === "new";
  const editing = !isNew;
  const nav = useNavigate();
  const session = useSession();
  const canSubmit = canSubmitSales(session.roles);

  const existing = useDoc<{
    name: string;
    supplier?: string;
    posting_date?: string;
    set_warehouse?: string;
    taxes_and_charges?: string;
    docstatus?: number;
    items?: Line[];
  }>(DT.purchaseReceipt, isNew ? undefined : name, isNew ? null : name);

  const [supplier, setSupplier] = useState("");
  const [postingDate, setPostingDate] = useState(today);
  const [warehouse, setWarehouse] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [party, setParty] = useState<Party>({});
  const [lines, setLines] = useState<Line[]>([{ item_code: "", qty: 1, rate: 0 }]);
  const [hydrated, setHydrated] = useState(isNew);
  const [saveError, setSaveError] = useState<unknown>(null);

  const templates = useDocList<{ name: string }>(DT.purchaseTaxTemplate, { fields: ["name"], limit: 50 });
  const partyCall = useFrappePostCall<{ message: Party }>(METHOD.getPartyDetails);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);
  const create = useInsert();
  const update = useSave();
  const submitCall = useFrappePostCall<{ message: { name: string } }>(METHOD.submit);
  const busy = create.loading || update.loading || submitCall.loading;

  useEffect(() => {
    if (!editing || !existing.data || hydrated) return;
    const d = existing.data;
    setSupplier(d.supplier || "");
    setPostingDate(d.posting_date || today);
    setWarehouse(d.set_warehouse || "");
    setTaxTemplate(d.taxes_and_charges || "");
    setLines(
      (d.items ?? []).length
        ? (d.items ?? []).map((row) => ({
            item_code: row.item_code || "",
            item_name: row.item_name,
            uom: row.uom,
            qty: Number(row.qty) || 1,
            rate: Number(row.rate) || 0,
            warehouse: (row as unknown as { warehouse?: string }).warehouse || d.set_warehouse || "",
            batch_no: (row as unknown as { batch_no?: string }).batch_no || "",
            serial_no: (row as unknown as { serial_no?: string }).serial_no || "",
          }))
        : [{ item_code: "", qty: 1, rate: 0 }],
    );
    setHydrated(true);
  }, [editing, existing.data, hydrated]);

  useEffect(() => {
    if (!supplier) return;
    partyCall
      .call({
        party: supplier,
        party_type: "Supplier",
        doctype: DT.purchaseReceipt,
        company: session.company,
        posting_date: postingDate,
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
    if (!item_code) return;
    try {
      const r = await itemCall.call({
        ctx: {
          item_code,
          supplier,
          doctype: DT.purchaseReceipt,
          company: session.company,
          buying_price_list: party.buying_price_list,
          currency: party.currency,
          transaction_date: postingDate,
          warehouse,
          qty: 1,
        },
      });
      const m = (r?.message ?? {}) as Record<string, unknown>;
      setLines((ls) =>
        ls.map((l, i) =>
          i === idx
            ? {
                ...l,
                item_code,
                item_name: (m.item_name as string) ?? l.item_name,
                uom: (m.uom as string) ?? l.uom,
                rate: Number(m.price_list_rate ?? m.rate ?? l.rate) || l.rate,
              }
            : l,
        ),
      );
    } catch {
      /* itemCall.error */
    }
  }

  const net = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const checks = [
    [t("nav.suppliers"), !!supplier],
    [t("inv.date"), !!postingDate],
    [t("nav.warehouses"), !!warehouse],
    [t("inv.lines"), lines.length > 0 && lines.every((l) => l.item_code)],
  ] as const;
  const ready = checks.every(([, ok]) => ok);

  if (!canWrite(session)) {
    return <ErrorBox error={new Error(t("team.denied"))} />;
  }
  if (editing && existing.isLoading && !hydrated) return <Loading />;
  if (editing && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (editing && existing.data && existing.data.docstatus !== 0) {
    return <Navigate to={`/purchase-receipts/${encodeURIComponent(name)}`} replace />;
  }

  function buildBody() {
    return {
      supplier,
      posting_date: postingDate,
      set_posting_time: 1,
      set_warehouse: warehouse,
      taxes_and_charges: taxTemplate || undefined,
      supplier_address: party.supplier_address,
      buying_price_list: party.buying_price_list,
      company: session.company || undefined,
      currency: party.currency || session.currency || undefined,
      items: lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        warehouse: l.warehouse || warehouse || undefined,
        batch_no: l.batch_no || undefined,
        serial_no: l.serial_no || undefined,
      })),
    };
  }

  async function save(shouldSubmit: boolean) {
    setSaveError(null);
    try {
      let docName = name;
      if (editing) {
        await update.updateDoc(DT.purchaseReceipt, name, buildBody());
      } else {
        const created = (await create.createDoc(DT.purchaseReceipt, buildBody())) as { name: string };
        docName = created.name;
      }
      if (shouldSubmit && docName) {
        await submitCall.call({ doc: { doctype: DT.purchaseReceipt, name: docName } });
      }
      nav(`/purchase-receipts/${encodeURIComponent(docName)}`);
    } catch (err) {
      setSaveError(err);
    }
  }

  const err = saveError || create.error || update.error || submitCall.error || partyCall.error;

  return (
    <>
      <PageHead
        eyebrow={
          <button
            type="button"
            className="btn quiet"
            onClick={() => nav(editing ? `/purchase-receipts/${encodeURIComponent(name)}` : "/purchase-receipts")}
          >
            {t("nav.purchaseReceipts")}
          </button>
        }
        title={editing ? t("pr.editTitle") : t("pr.new")}
        actions={
          <FormActions
            onDiscard={() => nav(editing ? `/purchase-receipts/${encodeURIComponent(name)}` : "/purchase-receipts")}
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
            <Field label={t("inv.date")} required htmlFor="pr-posting-date">
              <input
                id="pr-posting-date"
                name="posting_date"
                className="ctl"
                type="date"
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </Field>
            <Field label={t("nav.warehouses")} required>
              <LinkField
                doctype={DT.warehouse}
                value={warehouse}
                onChange={setWarehouse}
                filters={session.company ? [["company", "=", session.company], ["is_group", "=", 0]] : undefined}
              />
            </Field>
            <Field label={t("f.taxTemplate")} htmlFor="pr-tax-template">
              <select
                id="pr-tax-template"
                name="taxes_and_charges"
                className="ctl"
                value={taxTemplate}
                onChange={(e) => setTaxTemplate(e.target.value)}
                aria-label={t("f.taxTemplate")}
              >
                <option value="" />
                {(templates.data ?? []).map((x) => (
                  <option key={x.name} value={x.name}>
                    {x.name}
                  </option>
                ))}
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
                  <th>{t("nav.warehouses")}</th>
                  <th className="n">{t("sod.col.qty")}</th>
                  <th className="n">{t("sod.col.rate")}</th>
                  <th className="n">{t("sod.col.amount")}</th>
                  <th>{t("pr.batchNo")}</th>
                  <th>{t("pr.serialNo")}</th>
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
                    <td style={{ minWidth: 160 }}>
                      <LinkField
                        doctype={DT.warehouse}
                        value={l.warehouse ?? warehouse}
                        onChange={(v) =>
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, warehouse: v } : x)))
                        }
                        filters={session.company ? [["company", "=", session.company], ["is_group", "=", 0]] : undefined}
                      />
                    </td>
                    <td className="n">
                      <input
                        className="ctl mini nn"
                        style={{ width: 80 }}
                        value={l.qty}
                        onChange={(e) =>
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty: parseNum(e.target.value) } : x)))
                        }
                      />
                    </td>
                    <td className="n">
                      <input
                        className="ctl mini nn"
                        style={{ width: 104 }}
                        value={l.rate}
                        onChange={(e) =>
                          setLines((ls) => ls.map((x, j) => (j === i ? { ...x, rate: parseNum(e.target.value) } : x)))
                        }
                      />
                    </td>
                    <td className="n" style={{ fontWeight: 600 }}>
                      {money(l.qty * l.rate)}
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <input className="ctl mini" placeholder="Batch" value={l.batch_no ?? ""}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, batch_no: e.target.value } : x))} />
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <input className="ctl mini" placeholder="SN" value={l.serial_no ?? ""}
                        onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, serial_no: e.target.value } : x))} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="rm"
                        aria-label={t("inv.remove")}
                        onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="addrow">
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setLines((ls) => [...ls, { item_code: "", qty: 1, rate: 0, warehouse }])}
            >
              {t("soc.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
