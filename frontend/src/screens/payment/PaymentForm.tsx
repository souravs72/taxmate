import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useFrappeCreateDoc, useFrappeGetDoc, useFrappeGetDocList, useFrappePostCall, useFrappeUpdateDoc } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LinkField from "../../components/LinkField";

type PayDoc = {
  name?: string;
  payment_type?: string;
  party_type?: string;
  party?: string;
  posting_date?: string;
  paid_amount?: number;
  received_amount?: number;
  mode_of_payment?: string;
  company?: string;
  docstatus?: number;
  references?: { reference_doctype?: string; reference_name?: string; allocated_amount?: number }[];
};

export default function PaymentForm() {
  const { name = "new" } = useParams();
  const [params] = useSearchParams();
  const invoice = params.get("invoice") || "";
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const existing = useFrappeGetDoc<PayDoc>(DT.paymentEntry, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const mapper = useFrappePostCall<{ message: PayDoc }>(METHOD.getPaymentEntry);
  const submitCall = useFrappePostCall(METHOD.submit);
  const create = useFrappeCreateDoc();
  const update = useFrappeUpdateDoc();
  const modes = useFrappeGetDocList<{ name: string }>(DT.modeOfPayment, { fields: ["name"], limit: 30 });

  const [doc, setDoc] = useState<PayDoc>({
    payment_type: "Receive",
    party_type: "Customer",
    posting_date: toIsoDate(new Date()),
    paid_amount: 0,
    references: [],
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    if (existing.data) setDoc(existing.data);
  }, [existing.data]);

  useEffect(() => {
    if (!isNew || !invoice) return;
    mapper.call({ dt: DT.salesInvoice, dn: invoice }).then((r) => {
      if (r?.message) setDoc({ ...r.message, posting_date: r.message.posting_date || toIsoDate(new Date()) });
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, isNew]);

  const locked = existing.data?.docstatus === 1 || existing.data?.docstatus === 2;
  const canSubmit = canSubmitSales(session.roles);

  async function save(submitAfter: boolean) {
    setBusy(true); setSaveError(null);
    try {
      const body = {
        ...doc,
        payment_type: "Receive",
        party_type: "Customer",
        company: doc.company || session.company,
      };
      let payName: string;
      if (isNew) {
        const created = await create.createDoc(DT.paymentEntry, body);
        payName = (created as { name: string }).name;
      } else {
        await update.updateDoc(DT.paymentEntry, name, body);
        payName = name;
      }
      if (submitAfter && canSubmit) {
        await submitCall.call({ doc: { doctype: DT.paymentEntry, name: payName } });
      }
      nav(`/payments/${encodeURIComponent(payName)}`);
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={<a onClick={() => nav("/payments")} style={{ color: "var(--brand)", cursor: "pointer" }}>{t("nav.payments")}</a>}
        title={isNew ? t("pay.new") : name}
        actions={
          <>
            <button className="btn quiet" onClick={() => nav("/payments")}>{t("soc.discard")}</button>
            {!locked && (
              <button className="btn ghost" disabled={busy || !doc.party} onClick={() => void save(false)}>
                {t("soc.save")}
              </button>
            )}
            {!locked && canSubmit && (
              <button className="btn" disabled={busy || !doc.party} onClick={() => void save(true)}>
                {t("inv.submit")}
              </button>
            )}
          </>
        }
      />
      {(saveError || mapper.error || submitCall.error) && <ErrorBox error={saveError || mapper.error || submitCall.error} />}
      <Card title={t("pay.header")}>
        <div className="grid2">
          <Field label={t("pay.col.party")} required>
            {locked ? <input className="ctl readonly" readOnly value={doc.party ?? ""} /> : (
              <LinkField doctype={DT.customer} value={doc.party ?? ""} onChange={(v) => setDoc((d) => ({ ...d, party: v }))} />
            )}
          </Field>
          <Field label={t("inv.date")} required>
            <input className="ctl" type="date" value={doc.posting_date ?? ""} disabled={locked}
              onChange={(e) => setDoc((d) => ({ ...d, posting_date: e.target.value }))} />
          </Field>
          <Field label={t("pay.col.amount")} required>
            <input className="ctl" value={doc.paid_amount ?? 0} disabled={locked}
              onChange={(e) => setDoc((d) => ({ ...d, paid_amount: parseNum(e.target.value), received_amount: parseNum(e.target.value) }))} />
          </Field>
          <Field label={t("pay.mode")} required>
            <select className="ctl" value={doc.mode_of_payment ?? ""} disabled={locked}
              onChange={(e) => setDoc((d) => ({ ...d, mode_of_payment: e.target.value }))}>
              <option value="" />
              {(modes.data ?? []).map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      <Card title={t("pay.allocate")} bodyClass={null as unknown as string}>
        <div className="twrap">
          <table>
            <thead>
              <tr>
                <th>{t("inv.col.no")}</th>
                <th className="n">{t("pay.allocated")}</th>
              </tr>
            </thead>
            <tbody>
              {(doc.references ?? []).map((r, i) => (
                <tr key={i}>
                  <td className="mono">{r.reference_name}</td>
                  <td className="n">{money(r.allocated_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
