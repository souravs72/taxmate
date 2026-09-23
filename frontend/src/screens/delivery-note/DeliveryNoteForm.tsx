/**
 * Delivery Note create/edit.
 * Routes: /delivery-notes/new, /delivery-notes/:name/edit (App.tsx).
 * Persist: insert/save on DT.deliveryNote then METHOD.submit.
 * User instruction: Implement the plan as specified… complete all the to-dos.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales, canWrite } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import LinkField from "../../components/LinkField";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormActions, FormLayout, ReadinessCard } from "../../components/form";

type Line = { item_code: string; item_name?: string; uom?: string; qty: number; rate: number; warehouse?: string };
type Party = {
  customer_address?: string;
  taxes_and_charges?: string;
  selling_price_list?: string;
  tax_id?: string;
  currency?: string;
};

const today = toIsoDate(new Date());

export default function DeliveryNoteForm() {
  const { name = "new" } = useParams();
  const isNew = name === "new";
  const editing = !isNew;
  const nav = useNavigate();
  const session = useSession();
  const canSubmit = canSubmitSales(session.roles);

  const existing = useDoc<{
    name: string;
    customer?: string;
    posting_date?: string;
    set_warehouse?: string;
    taxes_and_charges?: string;
    docstatus?: number;
    items?: Line[];
  }>(DT.deliveryNote, isNew ? undefined : name, isNew ? null : name);

  const [customer, setCustomer] = useState("");
  const [postingDate, setPostingDate] = useState(today);
  const [warehouse, setWarehouse] = useState("");
  const [taxTemplate, setTaxTemplate] = useState("");
  const [party, setParty] = useState<Party>({});
  const [lines, setLines] = useState<Line[]>([{ item_code: "", qty: 1, rate: 0 }]);
  const [hydrated, setHydrated] = useState(!editing);
  const [saveError, setSaveError] = useState<unknown>(null);

  const partyCall = useFrappePostCall<{ message: Party }>(METHOD.getPartyDetails);
  const itemCall = useFrappePostCall<{ message: Record<string, unknown> }>(METHOD.getItemDetails);
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
    setLines(
      (d.items ?? []).length
        ? (d.items ?? []).map((row) => ({
            item_code: row.item_code || "",
            item_name: row.item_name,
            uom: row.uom,
            qty: Number(row.qty) || 1,
            rate: Number(row.rate) || 0,
            warehouse: (row as unknown as { warehouse?: string }).warehouse || d.set_warehouse || "",
          }))
        : [{ item_code: "", qty: 1, rate: 0 }],
    );
    setHydrated(true);
  }, [editing, existing.data, hydrated]);

  useEffect(() => {
    if (!customer) return;
    partyCall
      .call({
        party: customer,
        party_type: "Customer",
        doctype: DT.deliveryNote,
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
  }, [customer]);

  async function pickItem(idx: number, item_code: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, item_code } : l)));
    if (!item_code) return;
    try {
      const r = await itemCall.call({
        ctx: {
          item_code,
          customer,
          doctype: DT.deliveryNote,
          company: session.company,
          selling_price_list: party.selling_price_list,
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
    [t("dn.customer"), !!customer],
    [t("dn.date"), !!postingDate],
    [t("dn.warehouse"), !!warehouse],
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
      customer_address: party.customer_address,
      selling_price_list: party.selling_price_list,
      company: session.company || undefined,
      currency: party.currency || session.currency || undefined,
      items: lines.map((l) => ({
        item_code: l.item_code,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        warehouse: l.warehouse || warehouse || undefined,
      })),
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

  const err = saveError || create.error || update.error || submitCall.error || partyCall.error;

  return (
    <>
      <PageHead
        eyebrow={
          <button
            type="button"
            className="btn quiet"
            onClick={() => nav(editing ? `/delivery-notes/${encodeURIComponent(name)}` : "/delivery-notes")}
          >
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
              <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("dn.summary")}</h2>
              <SumRow k={t("dn.net")} v={money(net)} />
            </Card>
            <ReadinessCard
              checks={checks.map(([label, ok]) => ({ label, ok }))}
              title={t("soc.ready")}
              caption={t("soc.readyCap")}
            />
          </>
        }
      >
        <Card num={1} title={t("dn.header")}>
          <div className="grid2">
            <Field label={t("dn.customer")} required>
              <LinkField doctype={DT.customer} value={customer} onChange={setCustomer} />
            </Field>
            <Field label={t("dn.customerTrn")}>
              <input className="ctl readonly" readOnly value={party.tax_id || ""} />
            </Field>
            <Field label={t("dn.date")} required htmlFor="dn-posting-date">
              <input
                id="dn-posting-date"
                name="posting_date"
                className="ctl"
                type="date"
                value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
              />
            </Field>
            <Field label={t("dn.warehouse")} required>
              <LinkField
                doctype={DT.warehouse}
                value={warehouse}
                onChange={setWarehouse}
                filters={session.company ? [["company", "=", session.company], ["is_group", "=", 0]] : undefined}
              />
            </Field>
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
                        aria-label={t("dn.qty")}
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
                        aria-label={t("dn.rate")}
                      />
                    </td>
                    <td className="n" style={{ fontWeight: 600 }}>
                      {money(l.qty * l.rate)}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="rm"
                        aria-label={t("dn.removeLine")}
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
              {t("dn.addLine")}
            </button>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
