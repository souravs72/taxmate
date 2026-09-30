/**
 * Purchase Debit Note (return against Purchase Invoice).
 * Callers: App.tsx will import and route /purchase-invoices/:name/return (~after CreditNoteForm pattern L142);
 * PurchaseInvoiceDetail will add Debit Note button for submitted invoices.
 * No existing DebitNoteForm — CreditNoteForm.tsx is sales-only (METHOD.makeSalesReturn).
 * Schema: make_purchase_return → { supplier, is_return, return_against, items:[{item_code, qty, rate}] } → insert Purchase Invoice.
 * User: "Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself. … Don't stop until you have completed all the to-dos."
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useInsert } from "../../lib/resource";
import { money, parseNum } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LineItems, { type LineField } from "../../components/LineItems";

type ReturnLine = { item_code: string; item_name?: string; qty: number; rate: number };

type ReturnDoc = {
  supplier?: string;
  items?: ReturnLine[];
  return_against?: string;
  is_return?: number;
};

export default function DebitNoteForm() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const make = useFrappePostCall<{ message: ReturnDoc }>(METHOD.makePurchaseReturn);
  const create = useInsert();
  const [draft, setDraft] = useState<ReturnDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    make
      .call({ source_name: name })
      .then((r) => setDraft(r?.message ?? null))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setSaveError(null);
    try {
      const created = await create.createDoc(DT.purchaseInvoice, {
        ...draft,
        doctype: DT.purchaseInvoice,
      });
      nav(`/purchase-invoices/${encodeURIComponent((created as { name: string }).name)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (make.loading && !draft) return <Loading />;
  if (make.error) return <ErrorBox error={make.error} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav(`/purchase-invoices/${encodeURIComponent(name)}`)}>
            {name}
          </button>
        }
        title={t("pi.debit")}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav(`/purchase-invoices/${encodeURIComponent(name)}`)}>
              {t("soc.discard")}
            </button>
            <button type="button" className="btn" disabled={busy || !draft} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card title={t("inv.lines")} bodyClass={null}>
        {/* The returned item and its Quantity and Amount on the face of a
            phone card; the rate comes from the invoice being returned and is
            read-only, so it sits behind "More". The lines themselves come
            from make_purchase_return — none can be added or removed here. */}
        <LineItems<ReturnLine>
          rows={draft?.items ?? []}
          fields={[
            {
              key: "item", label: t("soc.pickItem"), slot: "title",
              render: (l) => l.item_name || l.item_code,
            },
            {
              key: "qty", label: t("sod.col.qty"), slot: "primary", numeric: true,
              render: (l, i) => (
                <input
                  className="ctl mini nn"
                  style={{ width: 80 }}
                  value={l.qty}
                  onChange={(e) =>
                    setDraft((d) =>
                      d
                        ? {
                            ...d,
                            items: (d.items ?? []).map((x, j) =>
                              j === i ? { ...x, qty: parseNum(e.target.value) } : x,
                            ),
                          }
                        : d,
                    )
                  }
                />
              ),
            },
            {
              key: "rate", label: t("sod.col.rate"), numeric: true,
              render: (l) => <span>{money(l.rate)}</span>,
            },
            {
              key: "amount", label: t("sod.col.amount"), slot: "primary", numeric: true,
              render: (l) => <span>{money(l.qty * l.rate)}</span>,
            },
          ] as LineField<ReturnLine>[]}
        />
      </Card>
      <Field label={t("pi.returnAgainst")}>
        <input className="ctl readonly" readOnly value={draft?.return_against || name} />
      </Field>
    </>
  );
}
