/**
 * JournalEntryForm — Phase 1 (accounts-module parity).
 *
 * Features added over the prior version:
 *  - On account select: calls get_je_account_details; stamps party_type,
 *    account_currency, exchange_rate on the line.
 *  - Party is required when account_type is Receivable or Payable.
 *  - multi_currency toggle: shows debit/credit in account currency and
 *    fetches exchange rates via get_exchange_rate.
 *  - cheque_no + cheque_date fields when voucher_type is "Bank Entry".
 *  - Opening Entry hint for Temporary Opening account.
 *  - Freeze warning when posting_date <= accounts_frozen_till.
 *  - Accounting Dimension fields on each line (Phase 7).
 *
 * NOTE: JE and PE are not VAT-period-locked (invoice-only lock). The
 * accounts_frozen_till freeze is an administrative books lock unrelated
 * to VAT return periods.
 */
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { leafAccountFilters, requiresParty, impliedPartyType } from "../../lib/accounts";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canSubmitSales } from "../../lib/roles";
import { money, parseNum, toIsoDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead, SumRow } from "../../components/ui";
import { FormLayout, ReadinessCard } from "../../components/form";
import LinkField from "../../components/LinkField";
import { useIsPhone } from "../../lib/useMedia";
import "./journal-mobile.css";

type AccountDetails = {
  account_type?: string;
  account_currency?: string;
  exchange_rate?: number;
  party_type?: string;
};

type Dimension = {
  fieldname: string;
  label: string;
  document_type?: string;
  mandatory_for_bs?: boolean;
  mandatory_for_pl?: boolean;
};

type LineDimensions = Record<string, string>;

type Line = {
  account: string;
  party_type: string;
  party: string;
  debit: number;
  credit: number;
  cost_center: string;
  account_currency: string;
  exchange_rate: number;
  account_type: string;
  dims: LineDimensions;
};

/**
 * A Receivable/Payable line whose party has not been chosen yet.
 *
 * `partyOk` in the readiness checklist blocks the save on exactly this, so on
 * a phone — where the party sits behind the "More" toggle — this is what the
 * card has to un-hide. Checking only party_type is not enough: picking a
 * Receivable account stamps party_type = "Customer" (impliedPartyType) while
 * the party itself is still empty, which would leave a mandatory, empty field
 * collapsed out of sight with the checklist refusing to go green. The desktop
 * table shows its Party column at every width and keeps its own narrower
 * test, so its markup is unchanged.
 */
const partyIncomplete = (row: Line) => requiresParty(row.account_type) && !row.party;

const TYPES = [
  "Journal Entry",
  "Bank Entry",
  "Cash Entry",
  "Contra Entry",
  "Write Off Entry",
  "Opening Entry",
];

type DocAccount = {
  account?: string;
  party_type?: string;
  party?: string;
  debit_in_account_currency?: number;
  credit_in_account_currency?: number;
  cost_center?: string;
  account_currency?: string;
  exchange_rate?: number;
  account_type?: string;
  [key: string]: unknown;
};

type Doc = {
  name: string;
  posting_date?: string;
  voucher_type?: string;
  user_remark?: string;
  cheque_no?: string;
  cheque_date?: string;
  bill_no?: string;
  bill_date?: string;
  multi_currency?: number;
  docstatus?: number;
  accounts?: DocAccount[];
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
  const defaults = useFrappePostCall<{ message: { company?: string; currency?: string; cost_center?: string; accounts_frozen_till?: string } }>(METHOD.getDefaults);
  const accountDetailsCall = useFrappePostCall<{ message: AccountDetails }>(METHOD.getJeAccountDetails);
  const exchangeRateCall = useFrappePostCall<{ message: number }>(METHOD.getExchangeRate);

  // Accounting Dimensions (Phase 7)
  const dimensionsCall = useFrappeGetCall<{ message: Dimension[] }>(
    METHOD.getAccountingDimensions,
    {},
    "accounting-dimensions",
    { revalidateOnFocus: false },
  );
  const dimensions: Dimension[] = dimensionsCall.data?.message ?? [];

  const [postingDate, setPostingDate] = useState(toIsoDate(new Date()));
  const [voucherType, setVoucherType] = useState("Journal Entry");
  const [remark, setRemark] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [billNo, setBillNo] = useState("");
  const [billDate, setBillDate] = useState("");
  const [multiCurrency, setMultiCurrency] = useState(false);
  /* Below 760px the account table is rendered as one card per line: at
     393px the table itself is 1,840px wide. Same data, same handlers —
     only the arrangement differs, and the table above 760px is untouched. */
  const phone = useIsPhone();
  const [openLines, setOpenLines] = useState<Record<number, boolean>>({});
  const [defaultCc, setDefaultCc] = useState("");
  const [frozenTill, setFrozenTill] = useState<string | null>(null);

  const blank = (cc = ""): Line => ({
    account: "", party_type: "", party: "", debit: 0, credit: 0,
    cost_center: cc, account_currency: "", exchange_rate: 1, account_type: "", dims: {},
  });

  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    defaults.call({}).then((r) => {
      setDefaultCc(r?.message?.cost_center || "");
      setFrozenTill(r?.message?.accounts_frozen_till || null);
    }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!defaultCc) return;
    setLines((rows) => rows.map((r) => (r.account || r.cost_center ? r : { ...r, cost_center: defaultCc })));
  }, [defaultCc]);

  /* A card that opened itself because its party was missing stays open once
     the party is filled in — otherwise it snaps shut under the finger that
     just filled it, hiding the value that was typed. Only ever adds `true`,
     so it cannot fight the toggle, and it is inert on the desktop table. */
  useEffect(() => {
    if (!phone) return;
    setOpenLines((o) => {
      let next = o;
      lines.forEach((row, i) => {
        if (partyIncomplete(row) && !o[i]) {
          if (next === o) next = { ...o };
          next[i] = true;
        }
      });
      return next;
    });
  }, [lines, phone]);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setPostingDate(d.posting_date || toIsoDate(new Date()));
    setVoucherType(d.voucher_type || "Journal Entry");
    setRemark(d.user_remark || "");
    setChequeNo(d.cheque_no || "");
    setChequeDate(d.cheque_date || "");
    setBillNo(d.bill_no || "");
    setBillDate(d.bill_date || "");
    setMultiCurrency(!!(d.multi_currency));
    const acc: Line[] = (d.accounts ?? []).map((r) => ({
      account: r.account || "",
      party_type: r.party_type || "",
      party: r.party || "",
      debit: Number(r.debit_in_account_currency) || 0,
      credit: Number(r.credit_in_account_currency) || 0,
      cost_center: r.cost_center || defaultCc,
      account_currency: r.account_currency || "",
      exchange_rate: Number(r.exchange_rate) || 1,
      account_type: r.account_type || "",
      dims: dimensions.reduce<LineDimensions>((o, dim) => {
        const v = r[dim.fieldname];
        return v != null ? { ...o, [dim.fieldname]: String(v) } : o;
      }, {}),
    }));
    setLines(acc.length >= 2 ? acc : [...acc, blank(defaultCc)]);
  }, [existing.data]); // eslint-disable-line react-hooks/exhaustive-deps

  /* If the document arrives before the dimension list, the effect above
     stores an empty dims map. Fill only keys the line does not already
     have, matched by account, so a later save does not drop them and a
     value typed in the meantime is kept. */
  useEffect(() => {
    const accounts = existing.data?.accounts;
    if (!accounts || dimensions.length === 0) return;
    setLines((rows) => {
      let changed = false;
      const next = rows.map((line, i) => {
        const src = accounts[i];
        if (!src || line.account !== (src.account || "")) return line;
        const dims = { ...line.dims };
        let rowChanged = false;
        for (const dim of dimensions) {
          if (dims[dim.fieldname] != null) continue;
          const v = src[dim.fieldname];
          if (v == null || v === "") continue;
          dims[dim.fieldname] = String(v);
          rowChanged = true;
        }
        if (!rowChanged) return line;
        changed = true;
        return { ...line, dims };
      });
      return changed ? next : rows;
    });
  }, [dimensions, existing.data]);

  const company = session.company;
  const companyCurrency = session.currency || "";

  async function onAccountChange(i: number, accountName: string) {
    setLine(i, { account: accountName, party_type: "", party: "", account_type: "", account_currency: "", exchange_rate: 1 });
    if (!accountName || !company || !postingDate) return;
    try {
      const res = await accountDetailsCall.call({ account: accountName, date: postingDate, company });
      const det = res?.message;
      if (!det) return;
      const impliedPt = impliedPartyType(det.account_type);
      const acctCur = det.account_currency || companyCurrency;
      let exRate = Number(det.exchange_rate) || 1;
      if (multiCurrency && acctCur && acctCur !== companyCurrency) {
        try {
          const erRes = await exchangeRateCall.call({ from_currency: acctCur, to_currency: companyCurrency, transaction_date: postingDate, args: "for_selling" });
          exRate = Number(erRes?.message) || exRate;
        } catch { /* non-fatal */ }
      }
      setLine(i, {
        account: accountName,
        party_type: impliedPt,
        party: "",
        account_type: det.account_type || "",
        account_currency: acctCur,
        exchange_rate: exRate,
      });
    } catch { /* non-fatal */ }
  }

  const filled = useMemo(
    () => lines.filter((l) => l.account && (l.debit > 0 || l.credit > 0)),
    [lines],
  );

  const debit = useMemo(() => filled.reduce((s, l) => {
    const amt = multiCurrency ? (Number(l.debit) || 0) * (Number(l.exchange_rate) || 1) : (Number(l.debit) || 0);
    return s + amt;
  }, 0), [filled, multiCurrency]);

  const credit = useMemo(() => filled.reduce((s, l) => {
    const amt = multiCurrency ? (Number(l.credit) || 0) * (Number(l.exchange_rate) || 1) : (Number(l.credit) || 0);
    return s + amt;
  }, 0), [filled, multiCurrency]);

  const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
  const accountsOk = filled.length >= 2 && filled.every((l) => (l.debit > 0) !== (l.credit > 0));
  const bankEntryOk = voucherType !== "Bank Entry" || (!!chequeNo && !!chequeDate);
  const partyOk = filled.every((l) => !requiresParty(l.account_type) || !!l.party);
  const ready = !!postingDate && accountsOk && balanced && bankEntryOk && partyOk;
  const canSubmit = canSubmitSales(session.roles);
  const cur = companyCurrency;
  const isFrozen = !!(frozenTill && postingDate && postingDate <= frozenTill);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function setLineDim(i: number, fieldname: string, value: string) {
    setLines((rows) => rows.map((r, idx) => idx === i ? { ...r, dims: { ...r.dims, [fieldname]: value } } : r));
  }

  function payload() {
    return {
      company,
      posting_date: postingDate,
      voucher_type: voucherType,
      user_remark: remark || undefined,
      multi_currency: multiCurrency ? 1 : 0,
      cheque_no: voucherType === "Bank Entry" ? chequeNo || undefined : undefined,
      cheque_date: voucherType === "Bank Entry" ? chequeDate || undefined : undefined,
      bill_no: billNo || undefined,
      bill_date: billDate || undefined,
      accounts: filled.map((l) => ({
        ...l.dims,
        account: l.account,
        party_type: l.party_type || undefined,
        party: l.party || undefined,
        debit_in_account_currency: l.debit || 0,
        credit_in_account_currency: l.credit || 0,
        account_currency: l.account_currency || companyCurrency || undefined,
        exchange_rate: Number(l.exchange_rate) || 1,
        cost_center: l.cost_center || defaultCc || undefined,
      })),
    };
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

  const acctFilters = company ? leafAccountFilters(company) : undefined;

  /* ── One editor per field ────────────────────────────────────────────
     The table and the phone cards both call these, so a line behaves
     identically either way and there is only one place to change a field.
     ──────────────────────────────────────────────────────────────────── */
  const fAccount = (i: number, row: Line) => (
    <LinkField
      doctype={DT.account}
      value={row.account}
      onChange={(v) => void onAccountChange(i, v)}
      placeholder={t("je.pickAccount")}
      filters={acctFilters}
    />
  );
  const fCostCenter = (i: number, row: Line) => (
    <LinkField
      doctype={DT.costCenter}
      value={row.cost_center}
      onChange={(v) => setLine(i, { cost_center: v })}
      placeholder={t("je.costCenter")}
      filters={company ? [["company", "=", company], ["is_group", "=", 0]] : undefined}
    />
  );
  const fPartyType = (i: number, row: Line) => (
    <select className="ctl" value={row.party_type}
      onChange={(e) => setLine(i, { party_type: e.target.value, party: "" })}>
      <option value="">{t("je.noParty")}</option>
      <option value="Customer">{t("nav.customers")}</option>
      <option value="Supplier">{t("nav.suppliers")}</option>
    </select>
  );
  const fPartyLink = (i: number, row: Line) => (
    <LinkField
      doctype={row.party_type === "Supplier" ? DT.supplier : DT.customer}
      value={row.party}
      onChange={(v) => setLine(i, { party: v })}
      placeholder={t("je.party")}
    />
  );
  /* Receivable and Payable accounts cannot post without a party. */
  const partyMissing = (row: Line) => requiresParty(row.account_type) && !row.party_type;
  const fRate = (i: number, row: Line, style?: React.CSSProperties) => (
    <input className="ctl n" style={style} value={row.exchange_rate || 1} inputMode="decimal"
      onChange={(e) => setLine(i, { exchange_rate: parseNum(e.target.value) || 1 })} />
  );
  const fDebit = (i: number, row: Line) => (
    <input className="ctl n" value={row.debit || ""} inputMode="decimal"
      onChange={(e) => setLine(i, { debit: parseNum(e.target.value), credit: 0 })} />
  );
  const fCredit = (i: number, row: Line) => (
    <input className="ctl n" value={row.credit || ""} inputMode="decimal"
      onChange={(e) => setLine(i, { credit: parseNum(e.target.value), debit: 0 })} />
  );
  const fDim = (i: number, row: Line, dim: Dimension) => (
    dim.document_type ? (
      <LinkField
        doctype={dim.document_type}
        value={row.dims[dim.fieldname] || ""}
        onChange={(v) => setLineDim(i, dim.fieldname, v)}
        placeholder={dim.label}
      />
    ) : (
      <input className="ctl" value={row.dims[dim.fieldname] || ""}
        onChange={(e) => setLineDim(i, dim.fieldname, e.target.value)}
        placeholder={dim.label} />
    )
  );
  /* openLines is keyed by line index, so removing a line has to shift the
     keys above it down with the lines themselves. Without this, the card that
     moves up into index i inherits the toggle state of the line that was
     removed, and a freshly added line can come up already expanded because a
     stale `true` is still sitting at its index. The table ignores openLines,
     so this is inert above 760px. */
  const removeLine = (i: number) => {
    setLines((r) => r.filter((_, idx) => idx !== i));
    setOpenLines((o) => {
      const next: Record<number, boolean> = {};
      for (const key of Object.keys(o)) {
        const idx = Number(key);
        if (idx === i) continue;
        next[idx > i ? idx - 1 : idx] = o[idx];
      }
      return next;
    });
  };
  const fill = (str: string, n: number | string) => str.split("{n}").join(String(n));


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
      {isFrozen && (
        <div className="alert bad" style={{ marginBottom: 10 }}>
          <span className="ic">!</span>
          <span><b>{t("je.frozen")}</b> {t("je.frozenHint")} {frozenTill}</span>
        </div>
      )}
      {voucherType === "Opening Entry" && (
        <div className="alert" style={{ marginBottom: 10 }}>
          <span className="ic">ℹ</span>
          <span>{t("je.openingHint")}</span>
        </div>
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
                { ok: partyOk, label: t("je.check.party") },
                ...(voucherType === "Bank Entry" ? [{ ok: bankEntryOk, label: t("je.check.cheque") }] : []),
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
          <div className="grid2">
            <Field label={t("je.billNo")}>
              <input className="ctl" value={billNo} onChange={(e) => setBillNo(e.target.value)} />
            </Field>
            <Field label={t("je.billDate")}>
              <input className="ctl" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
            </Field>
          </div>
          <Field label={t("je.col.remark")}>
            <input className="ctl" value={remark} onChange={(e) => setRemark(e.target.value)} />
          </Field>
          {voucherType === "Bank Entry" && (
            <div className="grid2" style={{ marginTop: 10 }}>
              <Field label={t("je.chequeNo")} required>
                <input className="ctl" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
              </Field>
              <Field label={t("je.chequeDate")} required>
                <input className="ctl" type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
              </Field>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <input id="je-multi-currency" type="checkbox" checked={multiCurrency}
              onChange={(e) => setMultiCurrency(e.target.checked)} />
            <label htmlFor="je-multi-currency" style={{ fontSize: 13, cursor: "pointer" }}>{t("je.multiCurrency")}</label>
          </div>
        </Card>

        <Card title={t("je.accounts")}>
          {phone ? (
            /* One card per line. Account and the amounts are on the face;
               cost centre, party and the dimensions collapse, because they
               are usually left as they come. A party the account requires
               never hides — its warning stays on the face and the card
               opens itself. */
            <div className="jel-list">
              {lines.map((row, i) => {
                const mustOpen = partyIncomplete(row);
                const open = !!openLines[i] || mustOpen;
                return (
                  <div className="jel-card" key={i}>
                    <div className="jel-head">
                      <span className="jel-n">{fill(t("je.lineN"), i + 1)}</span>
                      <button type="button" className="jel-rm"
                        aria-label={fill(t("je.removeLine"), i + 1)}
                        onClick={() => removeLine(i)}>×</button>
                    </div>

                    <div className="jel-f">
                      <label>{t("je.account")}</label>
                      {fAccount(i, row)}
                    </div>

                    {mustOpen && (
                      <p className="jel-warn" role="status">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                             strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                          <circle cx="8" cy="8" r="6.4" /><path d="M8 5v3.6M8 11h.01" />
                        </svg>
                        {t("je.partyRequired")}
                      </p>
                    )}

                    <div className="jel-money">
                      <div className="jel-f">
                        <label>{t("je.col.debit")}</label>
                        {fDebit(i, row)}
                      </div>
                      <div className="jel-f">
                        <label>{t("je.col.credit")}</label>
                        {fCredit(i, row)}
                      </div>
                    </div>

                    {!mustOpen && (
                      <button type="button" className="jel-more" aria-expanded={open}
                        onClick={() => setOpenLines((o) => ({ ...o, [i]: !o[i] }))}>
                        {open ? t("je.fewerFields") : t("je.moreFields")}
                        <svg className="jel-chev" width="12" height="12" viewBox="0 0 16 16" fill="none"
                             stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                          <path d="m4 6 4 4 4-4" />
                        </svg>
                      </button>
                    )}

                    {open && (
                      <div className="jel-extra">
                        <div className="jel-f">
                          <label>{t("je.costCenter")}</label>
                          {fCostCenter(i, row)}
                        </div>
                        <div className="jel-f">
                          <label>{t("je.party")}</label>
                          {fPartyType(i, row)}
                        </div>
                        {row.party_type && (
                          <div className="jel-f">
                            <label>{row.party_type === "Supplier" ? t("nav.suppliers") : t("nav.customers")}</label>
                            {fPartyLink(i, row)}
                          </div>
                        )}
                        {multiCurrency && (
                          <div className="jel-money">
                            <div className="jel-f">
                              <label>{t("je.currency")}</label>
                              <input className="ctl readonly" readOnly
                                value={row.account_currency || companyCurrency} />
                            </div>
                            <div className="jel-f">
                              <label>{t("je.exchangeRate")}</label>
                              {fRate(i, row)}
                            </div>
                          </div>
                        )}
                        {dimensions.length > 0 && (
                          <div className="jel-dims">
                            {dimensions.map((dim) => (
                              <div className="jel-f" key={dim.fieldname}>
                                <label>{dim.label}</label>
                                {fDim(i, row, dim)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("je.account")}</th>
                  <th>{t("je.costCenter")}</th>
                  <th>{t("je.party")}</th>
                  {multiCurrency && <th style={{ whiteSpace: "nowrap" }}>{t("je.currency")}</th>}
                  {multiCurrency && <th style={{ whiteSpace: "nowrap" }}>{t("je.exchangeRate")}</th>}
                  <th className="n">{t("je.col.debit")}</th>
                  <th className="n">{t("je.col.credit")}</th>
                  {dimensions.map((d) => <th key={d.fieldname}>{d.label}</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((row, i) => (
                  <tr key={i}>
                    <td style={{ minWidth: 180 }}>{fAccount(i, row)}</td>
                    <td style={{ minWidth: 140 }}>{fCostCenter(i, row)}</td>
                    <td>
                      <div className="grid2" style={{ minWidth: 200 }}>
                        {fPartyType(i, row)}
                        {row.party_type ? fPartyLink(i, row)
                          : partyMissing(row) ? (
                            <span style={{ color: "var(--warn)", fontSize: 12, alignSelf: "center" }}>
                              {t("je.partyRequired")}
                            </span>
                          ) : null}
                      </div>
                    </td>
                    {multiCurrency && (
                      <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                        {row.account_currency || companyCurrency}
                      </td>
                    )}
                    {multiCurrency && <td>{fRate(i, row, { width: 80 })}</td>}
                    <td>{fDebit(i, row)}</td>
                    <td>{fCredit(i, row)}</td>
                    {dimensions.map((dim) => (
                      <td key={dim.fieldname} style={{ minWidth: 120 }}>{fDim(i, row, dim)}</td>
                    ))}
                    <td>
                      <button type="button" className="btn quiet sm" onClick={() => removeLine(i)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <button type="button" className={`btn ghost sm${phone ? " jel-add" : ""}`}
            onClick={() => setLines((r) => [...r, blank(defaultCc)])}>
            {t("soc.addLine")}
          </button>
        </Card>
      </FormLayout>
    </>
  );
}
