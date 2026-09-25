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

type ReturnDoc = {
  supplier?: string;
  items?: { item_code: string; item_name?: string; qty: number; rate: number }[];
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
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th>{t("soc.pickItem")}</th>
                <th className="n">{t("sod.col.qty")}</th>
                <th className="n">{t("sod.col.rate")}</th>
                <th className="n">{t("sod.col.amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(draft?.items ?? []).map((l, i) => (
                <tr key={i}>
                  <td>{l.item_name || l.item_code}</td>
                  <td className="n">
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
                  </td>
                  <td className="n">{money(l.rate)}</td>
                  <td className="n">{money(l.qty * l.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Field label={t("pi.returnAgainst")}>
        <input className="ctl readonly" readOnly value={draft?.return_against || name} />
      </Field>
    </>
  );
}
