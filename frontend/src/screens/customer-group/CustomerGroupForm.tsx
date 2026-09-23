/**
 * Customer Group form. Routes: /customer-groups/new, /customer-groups/:name/edit
 * API: insert/save on "Customer Group". Callers: App.tsx. Phase 10.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc, useInsert, useSave } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Field } from "../../components/ui";
import { FormLayout } from "../../components/form";
import LinkField from "../../components/LinkField";

type Doc = { customer_group_name?: string; parent_customer_group?: string; is_group?: number };

export default function CustomerGroupForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.customerGroup, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [groupName, setGroupName] = useState("");
  const [parent, setParent] = useState("");
  const [isGroup, setIsGroup] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setGroupName(d.customer_group_name || "");
    setParent(d.parent_customer_group || "");
    setIsGroup(Number(d.is_group) || 0);
  }, [existing.data]);

  const ready = !!groupName.trim();

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        customer_group_name: groupName,
        parent_customer_group: parent || undefined,
        is_group: isGroup,
      };
      if (isNew) {
        const res = await create.createDoc(DT.customerGroup, payload) as { name: string };
        nav(`/customer-groups/${encodeURIComponent(res.name)}`);
      } else {
        await update.updateDoc(DT.customerGroup, name, payload);
        nav(`/customer-groups/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!canWrite(session)) return <Navigate to="/customer-groups" replace />;

  void session;
  return (
    <>
      <PageHead
        title={isNew ? t("cg.new") : name}
        actions={
          <>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => nav(-1)}>{t("form.cancel")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>{t("form.save")}</button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card num={1} title={t("cg.details")}>
          <div className="fields">
            <Field label={t("cg.groupName")} required htmlFor="cg-name">
              <input id="cg-name" className="ctl" value={groupName}
                onChange={(e) => setGroupName(e.target.value)} />
            </Field>
            <Field label={t("cg.col.parent")}>
              <LinkField doctype={DT.customerGroup} value={parent} onChange={setParent} />
            </Field>
            <Field label={t("cg.isGroup")}>
              <label className="toggle">
                <input type="checkbox" checked={isGroup === 1}
                  onChange={(e) => setIsGroup(e.target.checked ? 1 : 0)} />
                {t("cg.isGroup")}
              </label>
            </Field>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
