/**
 * BankReconciliation — Phase 14.
 * Callers: App.tsx /bank-reconciliation; nav.ts nav.bankReconciliation
 * API: taxmate.api.bank_reconciliation.get_uncleared_transactions (catalogued)
 *      taxmate.api.bank_reconciliation.mark_cleared (catalogued)
 * Data: [{doctype, name, date:"YYYY-MM-DD", party, amount, reference, type}]
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFrappePostCall } from "frappe-react-sdk";

import { DT, METHOD } from "../../lib/frappe";
import { useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { money, date as fmtDate } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";

type TxRow = {
  doctype: string;
  name: string;
  date: string;
  party: string;
  amount: number;
  reference: string;
  type: string;
};

type BankRow = { name: string };

/** Map ERPNext doctype to a SPA route prefix for drilldown. */
function spaRoute(doctype: string, name: string): string | null {
  if (doctype === "Payment Entry") return `/payments/${encodeURIComponent(name)}`;
  if (doctype === "Journal Entry") return `/journals/${encodeURIComponent(name)}`;
  if (doctype === "Sales Invoice") return `/invoices/${encodeURIComponent(name)}`;
  if (doctype === "Purchase Invoice") return `/purchase-invoices/${encodeURIComponent(name)}`;
  return null;
}

export default function BankReconciliation() {
  const nav = useNavigate();
  const session = useSession();
  const company = session.company || "";

  const banks = useDocList<BankRow>(DT.bankAccount, {
    fields: ["name"],
    filters: company ? [["company", "=", company]] : [],
    limit: 50,
  });

  const [bankAccount, setBankAccount] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<unknown>(null);
  const [clearanceDate, setClearanceDate] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearError, setClearError] = useState<unknown>(null);
  const [clearBusy, setClearBusy] = useState(false);

  const fetchCall = useFrappePostCall<{ message: TxRow[] }>(METHOD.getUnclearedTransactions);
  const markCall = useFrappePostCall<{ message: { status: string } }>(METHOD.markCleared);

  async function load() {
    if (!bankAccount) return;
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetchCall.call({
        bank_account: bankAccount,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      setRows(res?.message ?? []);
      setLoaded(true);
      setSelected(new Set());
    } catch (err) {
      setFetchError(err);
    } finally {
      setLoading(false);
    }
  }

  async function markCleared() {
    if (!clearanceDate || selected.size === 0) return;
    setClearBusy(true);
    setClearError(null);
    try {
      for (const key of selected) {
        const colonIdx = key.indexOf("::");
        const doctype = key.slice(0, colonIdx);
        const name = key.slice(colonIdx + 2);
        await markCall.call({ doctype, name, clearance_date: clearanceDate });
      }
      setRows((rs) => rs.filter((r) => !selected.has(`${r.doctype}::${r.name}`)));
      setSelected(new Set());
    } catch (err) {
      setClearError(err);
    } finally {
      setClearBusy(false);
    }
  }

  const toggleRow = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setSelected(
      selected.size === rows.length
        ? new Set()
        : new Set(rows.map((r) => `${r.doctype}::${r.name}`)),
    );

  const bankOptions = banks.data ?? [];

  return (
    <>
      <PageHead title={t("brec.title")} />
      <Card>
        <div className="fg">
          <Field label={t("brec.col.bank")}>
            <select
              className="ctl"
              value={bankAccount}
              onChange={(e) => {
                setBankAccount(e.target.value);
                setLoaded(false);
                setRows([]);
              }}
            >
              <option value="">{t("brec.bankPh")}</option>
              {bankOptions.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("brec.col.fromDate")}>
            <input
              className="ctl"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </Field>
          <Field label={t("brec.col.toDate")}>
            <input
              className="ctl"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </Field>
          <div style={{ paddingTop: 4 }}>
            <button
              className="btn"
              onClick={() => void load()}
              disabled={!bankAccount || loading}
            >
              {loading ? t("loading") : t("brec.load")}
            </button>
          </div>
        </div>
        {fetchError ? <ErrorBox error={fetchError} /> : null}
      </Card>

      {loaded && (
        <Card title={t("brec.uncleared")}>
          {clearError ? <ErrorBox error={clearError} /> : null}
          {rows.length === 0 ? (
            <p style={{ color: "var(--muted)", padding: "12px 0" }}>{t("brec.allClear")}</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
                <Field label={t("brec.col.clearDate")}>
                  <input
                    className="ctl"
                    type="date"
                    value={clearanceDate}
                    onChange={(e) => setClearanceDate(e.target.value)}
                  />
                </Field>
                <button
                  className="btn"
                  onClick={() => void markCleared()}
                  disabled={clearBusy || selected.size === 0 || !clearanceDate}
                >
                  {clearBusy ? t("loading") : t("brec.markCleared")} ({selected.size})
                </button>
              </div>
              <div className="twrap">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <input
                          type="checkbox"
                          checked={selected.size === rows.length && rows.length > 0}
                          onChange={toggleAll}
                        />
                      </th>
                      <th>{t("brec.col.date")}</th>
                      <th>{t("brec.col.ref")}</th>
                      <th>{t("brec.col.party")}</th>
                      <th>{t("brec.col.type")}</th>
                      <th className="n">{t("brec.col.amount")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const key = `${r.doctype}::${r.name}`;
                      return (
                        <tr key={key}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(key)}
                              onChange={() => toggleRow(key)}
                            />
                          </td>
                          <td>{fmtDate(r.date)}</td>
                          <td>
                            {spaRoute(r.doctype, r.name) ? (
                              <button type="button" className="btn quiet ordno"
                                style={{ padding: 0, fontWeight: 600, textDecoration: "underline", background: "none", border: "none", cursor: "pointer" }}
                                onClick={(e) => { e.stopPropagation(); nav(spaRoute(r.doctype, r.name)!); }}>
                                {r.name}
                              </button>
                            ) : <span className="ordno">{r.name}</span>}
                            {r.reference ? (
                              <span
                                style={{
                                  color: "var(--muted)",
                                  marginInlineStart: 6,
                                  fontSize: 12,
                                }}
                              >
                                {r.reference}
                              </span>
                            ) : null}
                          </td>
                          <td>{r.party || "—"}</td>
                          <td>{r.type}</td>
                          <td className="n tot">{money(r.amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {loading && <Loading />}
        </Card>
      )}
    </>
  );
}
