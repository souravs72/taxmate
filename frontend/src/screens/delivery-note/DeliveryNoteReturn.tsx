/**
 * Delivery Note return form. Mirrors CreditNoteForm pattern.
 * Callers: App.tsx /delivery-notes/:name/return.
 * API: METHOD.makeDnReturn -> resource.insert on Delivery Note.
 * User: "DeliveryNoteReturn.tsx — mirror CreditNoteForm / DebitNoteForm"
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useInsert } from "../../lib/resource";
import { money, parseNum } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead } from "../../components/ui";

type ReturnLine = { item_code: string; item_name?: string; qty: number; rate: number; uom?: string };
type ReturnDoc = {
  customer?: string;
  return_against?: string;
  is_return?: number;
  items?: ReturnLine[];
};

export default function DeliveryNoteReturn() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const make = useFrappePostCall<{ message: ReturnDoc }>(METHOD.makeDnReturn);
  const create = useInsert();
  const [draft, setDraft] = useState<ReturnDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    make.call({ source_name: name }).then((r) => {
      setDraft(r?.message ?? null);
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  async function save() {
    if (!draft) return;
    setBusy(true); setSaveError(null);
    try {
      const body: Record<string, unknown> = { ...draft };
      delete body.name;
      delete body.__islocal;
      delete body.__unsaved;
      const created = await create.createDoc(DT.deliveryNote, body) as { name: string };
      nav(`/delivery-notes/${encodeURIComponent(created.name)}`);
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
          <button type="button" className="btn quiet" onClick={() => nav(`/delivery-notes/${encodeURIComponent(name)}`)}>
            {name}
          </button>
        }
        title={t("dn.returnTitle")}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav(`/delivery-notes/${encodeURIComponent(name)}`)}>
              {t("soc.discard")}
            </button>
            <button type="button" className="btn" disabled={busy || !draft} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card title={t("dn.items")} bodyClass={null}>
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th>{t("dn.item")}</th>
                <th className="n">{t("dn.qty")}</th>
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
                      value={Math.abs(l.qty)}
                      onChange={(e) => setDraft((d) => d ? {
                        ...d,
                        items: (d.items ?? []).map((x, j) =>
                          j === i ? { ...x, qty: -Math.abs(parseNum(e.target.value)) } : x),
                      } : d)}
                    />
                  </td>
                  <td className="n">{money(l.rate)}</td>
                  <td className="n">{money(Math.abs(l.qty) * l.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
