/**
 * Item Group create/edit form.
 * Callers: App.tsx /catalogue/item-groups/new and /catalogue/item-groups/:name.
 * API: taxmate.api.resource.insert/save on "Item Group".
 * Schema: item_group_name, parent_item_group, is_group.
 * User: "Item Group — /catalogue/item-groups, /new, /:name (edit in same form)"
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Field, Loading, PageHead } from "../../components/ui";
import LinkField from "../../components/LinkField";

type Doc = { name: string; item_group_name?: string; parent_item_group?: string; is_group?: number };

export default function ItemGroupForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.itemGroup, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [form, setForm] = useState({ item_group_name: "", parent_item_group: "", is_group: 0 as 0 | 1 });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setForm({
      item_group_name: d.item_group_name || d.name || "",
      parent_item_group: d.parent_item_group || "",
      is_group: (d.is_group || 0) as 0 | 1,
    });
  }, [existing.data]);

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !!form.item_group_name;

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        item_group_name: form.item_group_name,
        parent_item_group: form.parent_item_group || undefined,
        is_group: form.is_group,
      };
      const doc = isNew
        ? await create.createDoc(DT.itemGroup, payload)
        : await update.updateDoc(DT.itemGroup, name, payload);
      nav(`/catalogue/item-groups/${encodeURIComponent((doc as { name: string }).name)}`);
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/catalogue/item-groups")}>
            {t("nav.itemGroups")}
          </button>
        }
        title={isNew ? t("ig.new") : form.item_group_name || name}
        actions={
          <>
            <button type="button" className="btn ghost" onClick={() => nav("/catalogue/item-groups")}>{t("soc.discard")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>
              {busy ? t("soc.saving") : t("soc.save")}
            </button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <Card>
        <div className="grid2">
          <Field label={t("ig.name")} required>
            <input className="ctl" value={form.item_group_name}
              onChange={(e) => set("item_group_name", e.target.value)} />
          </Field>
          <Field label={t("ig.parent")}>
            <LinkField
              doctype={DT.itemGroup}
              value={form.parent_item_group}
              onChange={(v) => set("parent_item_group", v)}
            />
          </Field>
          <Field label={t("ig.isGroup")}>
            <select className="ctl" value={String(form.is_group)} onChange={(e) => set("is_group", Number(e.target.value))}>
              <option value="0">{t("no")}</option>
              <option value="1">{t("yes")}</option>
            </select>
          </Field>
        </div>
      </Card>
    </>
  );
}
