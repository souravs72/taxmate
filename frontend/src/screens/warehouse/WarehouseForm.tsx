/**
 * Warehouse create/edit form.
 * Importers: App.tsx routes /warehouses/new, /warehouses/:name/edit.
 * API: taxmate.api.resource.insert/save on Warehouse. Schema: warehouse_name,company,warehouse_type,parent_warehouse,is_group.
 * User: "Implement the plan as specified… complete all the to-dos."
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc, useDocList, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LinkField from "../../components/LinkField";

const WH_TYPES = ["Transit", "Stores", "Scrap", "Finished Goods", "Raw Material", "Work In Progress"];

type Doc = { name: string; warehouse_name?: string; company?: string; warehouse_type?: string; parent_warehouse?: string; is_group?: number; account?: string; disabled?: number; };

export default function WarehouseForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.warehouse, isNew ? undefined : name, isNew ? null : name, { isPaused: () => isNew });
  const types = useDocList<{ name: string }>("Warehouse Type", { fields: ["name"], limit: 50 });
  const create = useInsert();
  const update = useSave();

  const [form, setFormState] = useState({
    warehouse_name: "",
    company: session.company ?? "",
    warehouse_type: "",
    parent_warehouse: "",
    is_group: 0 as 0 | 1,
    account: "",
    disabled: 0 as 0 | 1,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setFormState({
      warehouse_name: d.warehouse_name || d.name || "",
      company: d.company || session.company || "",
      warehouse_type: d.warehouse_type || "",
      parent_warehouse: d.parent_warehouse || "",
      is_group: (d.is_group || 0) as 0 | 1,
      account: d.account || "",
      disabled: (d.disabled || 0) as 0 | 1,
    });
  }, [existing.data, session.company]);

  const set = (k: string, v: string | number) => setFormState((f) => ({ ...f, [k]: v }));
  const ready = !!form.warehouse_name && !!form.company;

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        warehouse_name: form.warehouse_name,
        company: form.company,
        warehouse_type: form.warehouse_type || undefined,
        parent_warehouse: form.parent_warehouse || undefined,
        is_group: form.is_group,
        account: form.account || undefined,
        disabled: form.disabled,
      };
      const doc = isNew
        ? await create.createDoc(DT.warehouse, payload)
        : await update.updateDoc(DT.warehouse, name, payload);
      nav(`/warehouses/${encodeURIComponent((doc as { name: string }).name)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  const availableTypes = (types.data ?? []).length > 0
    ? types.data!
    : WH_TYPES.map((n) => ({ name: n }));

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/warehouses")}>
            {t("nav.warehouses")}
          </button>
        }
        title={isNew ? t("wh.new") : form.warehouse_name || name}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/warehouses")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card>
        <div className="grid2">
          <Field label={t("wh.col.name2")} required>
            <input className="ctl" value={form.warehouse_name} onChange={(e) => set("warehouse_name", e.target.value)} />
          </Field>
          <Field label={t("coa.company")} required>
            <input className="ctl readonly" readOnly value={form.company} />
          </Field>
          <Field label={t("wh.col.type2")}>
            <select className="ctl" value={form.warehouse_type} onChange={(e) => set("warehouse_type", e.target.value)}>
              <option value="" />
              {availableTypes.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            </select>
          </Field>
          <Field label={t("wh.col.parent2")}>
            <LinkField
              doctype={DT.warehouse}
              value={form.parent_warehouse}
              onChange={(v) => set("parent_warehouse", v)}
              filters={session.company ? [["company", "=", session.company]] as never : undefined}
            />
          </Field>
          <Field label={t("wh.isGroup")}>
            <select className="ctl" value={String(form.is_group)} onChange={(e) => set("is_group", Number(e.target.value))}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
          <Field label={t("wh.account")}>
            <LinkField
              doctype={DT.account}
              value={form.account}
              onChange={(v) => set("account", v)}
              filters={session.company ? [["company", "=", session.company], ["is_group", "=", 0]] as never : undefined}
            />
          </Field>
          <Field label={t("coa.disabled")}>
            <select className="ctl" value={String(form.disabled)} onChange={(e) => set("disabled", Number(e.target.value))}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
        </div>
      </Card>
    </>
  );
}
