import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappeCreateDoc, useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { money, parseNum } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";

type ReturnDoc = {
  customer?: string;
  items?: { item_code: string; item_name?: string; qty: number; rate: number }[];
  uae_credit_note_reason?: string;
  return_against?: string;
  is_return?: number;
};

export default function CreditNoteForm() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const make = useFrappePostCall<{ message: ReturnDoc }>(METHOD.makeSalesReturn);
  const create = useFrappeCreateDoc();
  const [draft, setDraft] = useState<ReturnDoc | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    make.call({ source_name: name }).then((r) => {
      const doc = r?.message ?? null;
      setDraft(doc);
      setReason(doc?.uae_credit_note_reason || "");
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function save() {
    if (!draft) return;
    if (!reason.trim()) {
      setSaveError({ message: t("inv.reasonRequired") });
      return;
    }
    setBusy(true); setSaveError(null);
    try {
      const created = await create.createDoc(DT.salesInvoice, {
        ...draft,
        doctype: DT.salesInvoice,
        uae_credit_note_reason: reason,
      });
      nav(`/invoices/${encodeURIComponent((created as { name: string }).name)}`);
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (make.loading && !draft) return <Loading />;
  if (make.error) return <ErrorBox error={make.error} />;

  return (
    <>
      <PageHead
        eyebrow={<a onClick={() => nav(`/invoices/${encodeURIComponent(name)}`)} style={{ color: "var(--brand)", cursor: "pointer" }}>{name}</a>}
        title={t("inv.credit")}
        actions={
          <>
            <button className="btn quiet" onClick={() => nav(`/invoices/${encodeURIComponent(name)}`)}>{t("soc.discard")}</button>
            <button className="btn" disabled={busy || !reason.trim()} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card title={t("inv.reason")} hint={t("inv.reasonHint")}>
        <Field label={t("inv.reason")} required>
          <input className="ctl" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Card>
      <Card title={t("inv.lines")} bodyClass={null as unknown as string}>
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
                    <input className="ctl mini nn" style={{ width: 80 }} value={l.qty}
                      onChange={(e) => setDraft((d) => d ? {
                        ...d,
                        items: (d.items ?? []).map((x, j) => j === i ? { ...x, qty: parseNum(e.target.value) } : x),
                      } : d)} />
                  </td>
                  <td className="n">{money(l.rate)}</td>
                  <td className="n">{money(l.qty * l.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
