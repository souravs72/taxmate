import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";

type Line = { account: string; party_type: string; party: string; debit: number; credit: number; cost_center: string };

const TYPES = [
  "Journal Entry",
  "Bank Entry",
  "Cash Entry",
  "Contra Entry",
  "Write Off Entry",
  "Opening Entry",
];

type Doc = {
  name: string;
  posting_date?: string;
  voucher_type?: string;
  user_remark?: string;
  docstatus?: number;
  accounts?: {
    account?: string;
    party_type?: string;
    party?: string;
    debit_in_account_currency?: number;
    credit_in_account_currency?: number;
    cost_center?: string;
  }[];
};

export default function JournalEntryForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";
  const existing = useDoc<Doc>(DT.journalEntry, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const submitCall = useFrappePostCall(METHOD.submit);
  const create = useInsert();
  const update = useSave();
  const defaults = useFrappePostCall<{ message: { company?: string; currency?: string; cost_center?: string } }>(METHOD.getDefaults);

  const [postingDate, setPostingDate] = useState(toIsoDate(new Date()));
  const [voucherType, setVoucherType] = useState("Journal Entry");
  const [remark, setRemark] = useState("");
  const [defaultCc, setDefaultCc] = useState("");
  const blank = (cc = ""): Line => ({ account: "", party_type: "", party: "", debit: 0, credit: 0, cost_center: cc });
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    defaults.call({}).then((r) => setDefaultCc(r?.message?.cost_center || "")).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!defaultCc) return;
    setLines((rows) => rows.map((r) => (r.account || r.cost_center ? r : { ...r, cost_center: defaultCc })));
  }, [defaultCc]);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setPostingDate(d.posting_date || toIsoDate(new Date()));
    setVoucherType(d.voucher_type || "Journal Entry");
    setRemark(d.user_remark || "");
    const acc = (d.accounts ?? []).map((r) => ({
      account: r.account || "",
      party_type: r.party_type || "",
      party: r.party || "",
      debit: Number(r.debit_in_account_currency) || 0,
      credit: Number(r.credit_in_account_currency) || 0,
      cost_center: r.cost_center || defaultCc,
    }));
    setLines(acc.length >= 2 ? acc : [...acc, blank(defaultCc)]);
  }, [existing.data]);

  const filled = useMemo(
    () => lines.filter((l) => l.account && (l.debit > 0 || l.credit > 0)),
    [lines],
  );
  const debit = useMemo(() => filled.reduce((s, l) => s + (Number(l.debit) || 0), 0), [filled]);
  const credit = useMemo(() => filled.reduce((s, l) => s + (Number(l.credit) || 0), 0), [filled]);
  const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
  const accountsOk = filled.length >= 2 && filled.every((l) => (l.debit > 0) !== (l.credit > 0));
  const ready = !!postingDate && accountsOk && balanced;
  const canSubmit = canSubmitSales(session.roles);
  const company = session.company;
  const cur = session.currency || "";

  function payload() {
    return {
      company,
      posting_date: postingDate,
      voucher_type: voucherType,
      user_remark: remark || undefined,
      accounts: filled.map((l) => ({
        account: l.account,
        party_type: l.party_type || undefined,
        party: l.party || undefined,
        debit_in_account_currency: l.debit || 0,
        credit_in_account_currency: l.credit || 0,
        cost_center: l.cost_center || defaultCc || undefined,
      })),
    };
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const docname = isNew
        ? (await create.createDoc(DT.journalEntry, payload()) as { name: string }).name
        : (await update.updateDoc(DT.journalEntry, name, payload()), name);
      nav(`/journals/${encodeURIComponent(docname)}`);
    } catch (err) { setSaveError(err); }
    finally { setBusy(false); }
  }

  async function submitDoc() {
    setBusy(true); setSaveError(null);
    try {
      let docname = name;
      if (isNew) {
        const created = await create.createDoc(DT.journalEntry, payload());
        docname = (created as { name: string }).name;
      } else {
        await update.updateDoc(DT.journalEntry, name, payload());
      }
      await submitCall.call({ doc: { doctype: DT.journalEntry, name: docname } });
      nav(`/journals/${encodeURIComponent(docname)}`);
    } catch (err) {
      setSaveError(err);
      if (!isNew) await existing.mutate();
    } finally { setBusy(false); }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!isNew && existing.data && existing.data.docstatus !== 0) {
    return <Navigate to={`/journals/${encodeURIComponent(name)}`} replace />;
  }

  return (
    <>
      <PageHead
        title={isNew ? t("je.new") : t("inv.edit")}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/journals")}>{t("soc.discard")}</button>
            <button type="button" className="btn ghost" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
            {canSubmit && (
              <button type="button" className="btn" disabled={busy || !ready} onClick={() => void submitDoc()}>
                {t("inv.submit")}
              </button>
            )}
          </>
        }
      />
      {(saveError || create.error || update.error || submitCall.error) && (
        <ErrorBox error={saveError || create.error || update.error || submitCall.error} />
      )}
      <FormLayout
        aside={
          <>
            <Card bodyClass="cbody">
              <h2 style={{ margin: "0 0 13px", fontSize: 13.5, fontWeight: 600 }}>{t("je.totals")}</h2>
              <SumRow k={t("je.col.debit")} v={money(debit)} currency={cur} />
              <SumRow k={t("je.col.credit")} v={money(credit)} currency={cur} />
              <SumRow k={t("je.diff")} v={money(Math.abs(debit - credit))} cls="rule total" currency={cur} />
            </Card>
            <ReadinessCard
              checks={[
                { ok: !!postingDate, label: t("je.check.date") },
                { ok: accountsOk, label: t("je.check.lines") },
                { ok: balanced, label: t("je.check.balance") },
              ]}
            />
          </>
        }
      >
        <Card>
          <div className="grid2">
            <Field label={t("inv.col.date")}>
              <input className="ctl" type="date" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} />
            </Field>
            <Field label={t("je.col.type")}>
              <select className="ctl" value={voucherType} onChange={(e) => setVoucherType(e.target.value)}>
                {TYPES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t("je.col.remark")}>
            <input className="ctl" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </Field>
        </Card>
        <Card title={t("je.accounts")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("je.account")}</th>
                  <th>{t("je.costCenter")}</th>
                  <th>{t("je.party")}</th>
                  <th className="n">{t("je.col.debit")}</th>
                  <th className="n">{t("je.col.credit")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <LinkField
                        doctype={DT.account}
                        value={row.account}
                        onChange={(v) => setLine(i, { account: v })}
                        placeholder={t("je.pickAccount")}
                        filters={company ? [["company", "=", company], ["is_group", "=", 0], ["disabled", "=", 0]] : undefined}
                      />
                    </td>
                    <td>
                      <LinkField
                        doctype={DT.costCenter}
                        value={row.cost_center}
                        onChange={(v) => setLine(i, { cost_center: v })}
                        placeholder={t("je.costCenter")}
                        filters={company ? [["company", "=", company], ["is_group", "=", 0]] : undefined}
                      />
                    </td>
                    <td>
                      <div className="grid2" style={{ minWidth: 180 }}>
                        <select className="ctl" value={row.party_type}
                          onChange={(e) => setLine(i, { party_type: e.target.value, party: "" })}>
                          <option value="">{t("je.noParty")}</option>
                          <option value="Customer">{t("nav.customers")}</option>
                          <option value="Supplier">{t("nav.suppliers")}</option>
                        </select>
                        {row.party_type ? (
                          <LinkField
                            doctype={row.party_type === "Supplier" ? DT.supplier : DT.customer}
                            value={row.party}
                            onChange={(v) => setLine(i, { party: v })}
                            placeholder={t("je.party")}
                          />
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <input className="ctl n" value={row.debit || ""} inputMode="decimal"
                        onChange={(e) => setLine(i, { debit: parseNum(e.target.value), credit: 0 })} />
                    </td>
                    <td>
                      <input className="ctl n" value={row.credit || ""} inputMode="decimal"
                        onChange={(e) => setLine(i, { credit: parseNum(e.target.value), debit: 0 })} />
                    </td>
                    <td>
                      <button type="button" className="btn quiet sm" onClick={() => setLines((r) => r.filter((_, idx) => idx !== i))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn ghost sm" onClick={() => setLines((r) => [...r, blank(defaultCc)])}>
            {t("soc.addLine")}
          </button>
        </Card>
      </FormLayout>
    </>
  );
}
