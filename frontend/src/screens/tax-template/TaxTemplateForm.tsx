/**
 * TaxTemplateForm — create/edit Sales Taxes and Charges Template or
 * Purchase Taxes and Charges Template (Phase 11).
 * Callers: App.tsx /tax-templates/:kind/new, /tax-templates/:kind/:name/edit
 * API: taxmate.api.resource.insert / save on the appropriate DocType.
 * Child table field: taxes[]{charge_type, account_head, rate, description}
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import { FormActions, FormLayout } from "../../components/form";

const CHARGE_TYPES = [
  "Actual",
  "On Net Total",
  "On Previous Row Amount",
  "On Previous Row Total",
  "On Item Quantity",
];

type TaxRow = {
  _key: string;
  charge_type: string;
  account_head: string;
  rate: number;
  description: string;
};

type Doc = {
  name: string;
  title?: string;
  company?: string;
  is_default?: 0 | 1;
  taxes?: {
    charge_type?: string;
    account_head?: string;
    rate?: number;
    description?: string;
  }[];
};

let _k = 0;
const newKey = () => `tr${++_k}`;
const emptyRow = (): TaxRow => ({
  _key: newKey(),
  charge_type: "On Net Total",
  account_head: "",
  rate: 5,
  description: "",
});

export default function TaxTemplateForm() {
  const { kind: kindParam = "sales", name = "new" } = useParams();
  const kind = kindParam === "purchase" ? "purchase" : "sales";
  const dt = kind === "purchase" ? DT.purchaseTaxTemplate : DT.taxTemplate;
  const nav = useNavigate();
  const isNew = name === "new";
  const session = useSession();
  const company = session.company || "";

  const existing = useDoc<Doc>(dt, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });

  const taxAccounts = useDocList<{ name: string; account_name: string }>(DT.account, {
    fields: ["name", "account_name"],
    filters: [
      ["account_type", "in", ["Tax", "Chargeable"]],
      ["is_group", "=", 0],
      ...(company ? [["company", "=", company] as [string, string, string]] : []),
    ],
    limit: 150,
  });

  const create = useInsert();
  const update = useSave();

  const [title, setTitle] = useState("");
  const [isDefault, setIsDefault] = useState<0 | 1>(0);
  const [rows, setRows] = useState<TaxRow[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setTitle(d.title || d.name || "");
    setIsDefault(d.is_default ? 1 : 0);
    setRows(
      (d.taxes ?? []).length > 0
        ? (d.taxes ?? []).map((r) => ({
            _key: newKey(),
            charge_type: r.charge_type || "On Net Total",
            account_head: r.account_head || "",
            rate: Number(r.rate ?? 5),
            description: r.description || "",
          }))
        : [emptyRow()],
    );
  }, [existing.data]);

  const setRow = (key: string, field: keyof TaxRow, value: string | number) =>
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, [field]: value } : r)));

  const addRow = () => setRows((rs) => [...rs, emptyRow()]);
  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r._key !== key) : rs));

  const ready = !!title.trim() && rows.every((r) => !!r.account_head);

  async function saveFn() {
    if (!ready) return;
    setBusy(true);
    setSaveError(null);
    try {
      const payload = {
        title,
        company,
        is_default: isDefault,
        taxes: rows.map(({ _key: _k2, ...r }) => r),
      };
      if (isNew) {
        const doc = (await create.createDoc(dt, payload)) as { name: string };
        nav(`/tax-templates/${kind}/${encodeURIComponent(doc.name)}`);
      } else {
        await update.updateDoc(dt, name, payload);
        nav(`/tax-templates/${kind}/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  const acctOptions = taxAccounts.data ?? [];

  return (
    <>
      <PageHead
        eyebrow={
          <button
            type="button"
            className="btn quiet"
            onClick={() => nav(`/tax-templates?kind=${kind}`)}
          >
            {t("tx.title")}
          </button>
        }
        title={isNew ? t("tx.newTitle") : title || name}
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card>
          <div className="fg">
            <Field label={t("tx.col.name")} required>
              <input
                className="ctl"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === "purchase" ? t("tx.ph.purchase") : t("tx.ph.sales")}
              />
            </Field>
            <Field label={t("tx.col.company")}>
              <input className="ctl" type="text" value={company} readOnly disabled />
            </Field>
            <Field label={t("tx.col.default")}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={!!isDefault}
                  onChange={(e) => setIsDefault(e.target.checked ? 1 : 0)}
                />
                {t("tx.makeDefault")}
              </label>
            </Field>
          </div>
        </Card>

        <Card title={t("tx.charges")}>
          <div className="twrap">
            <table>
              <thead>
                <tr>
                  <th>{t("tx.col.charge")}</th>
                  <th>{t("tx.col.account")}</th>
                  <th className="n">{t("tx.col.rate")}</th>
                  <th>{t("tx.col.desc")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._key}>
                    <td>
                      <select
                        className="ctl"
                        value={r.charge_type}
                        onChange={(e) => setRow(r._key, "charge_type", e.target.value)}
                      >
                        {CHARGE_TYPES.map((ct) => (
                          <option key={ct} value={ct}>
                            {ct}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select
                        className="ctl"
                        value={r.account_head}
                        onChange={(e) => setRow(r._key, "account_head", e.target.value)}
                      >
                        <option value="">{t("tx.acctPh")}</option>
                        {acctOptions.map((a) => (
                          <option key={a.name} value={a.name}>
                            {a.account_name || a.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        className="ctl"
                        type="number"
                        min={0}
                        step={0.01}
                        value={r.rate}
                        onChange={(e) => setRow(r._key, "rate", Number(e.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        className="ctl"
                        type="text"
                        value={r.description}
                        onChange={(e) => setRow(r._key, "description", e.target.value)}
                        placeholder={t("tx.descPh")}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => removeRow(r._key)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ marginTop: 8 }}
            onClick={addRow}
          >
            {t("tx.addRow")}
          </button>
        </Card>

        <FormActions
          onSave={() => void saveFn()}
          onDiscard={() =>
            nav(
              isNew
                ? `/tax-templates?kind=${kind}`
                : `/tax-templates/${kind}/${encodeURIComponent(name)}`,
            )
          }
          busy={busy}
          ready={ready}
        />
      </FormLayout>
    </>
  );
}
