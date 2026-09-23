/**
 * Territory form. Routes: /territories/new, /territories/:name/edit
 * API: insert/save on "Territory". Callers: App.tsx. Phase 10.
 * User instruction: Phase 10 Territory list/form (flat list+parent ok for trees).
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

type Doc = { territory_name?: string; parent_territory?: string; is_group?: number };

export default function TerritoryForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const isNew = name === "new";

  const existing = useDoc<Doc>(DT.territory, isNew ? undefined : name, isNew ? null : name, {
    isPaused: () => isNew,
  });
  const create = useInsert();
  const update = useSave();

  const [terName, setTerName] = useState("");
  const [parent, setParent] = useState("");
  const [isGroup, setIsGroup] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);

  useEffect(() => {
    const d = existing.data;
    if (!d) return;
    setTerName(d.territory_name || "");
    setParent(d.parent_territory || "");
    setIsGroup(Number(d.is_group) || 0);
  }, [existing.data]);

  const ready = !!terName.trim();

  async function save() {
    setBusy(true); setSaveError(null);
    try {
      const payload = {
        territory_name: terName,
        parent_territory: parent || undefined,
        is_group: isGroup,
      };
      if (isNew) {
        const res = await create.createDoc(DT.territory, payload) as { name: string };
        nav(`/territories/${encodeURIComponent(res.name)}`);
      } else {
        await update.updateDoc(DT.territory, name, payload);
        nav(`/territories/${encodeURIComponent(name)}`);
      }
    } catch (err) {
      setSaveError(err);
    } finally {
      setBusy(false);
    }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!canWrite(session)) return <Navigate to="/territories" replace />;

  void session;
  return (
    <>
      <PageHead
        title={isNew ? t("ter.new") : name}
        actions={
          <>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => nav(-1)}>{t("form.cancel")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void save()}>{t("form.save")}</button>
          </>
        }
      />
      {saveError && <ErrorBox error={saveError} />}
      <FormLayout>
        <Card num={1} title={t("ter.details")}>
          <div className="fields">
            <Field label={t("ter.terName")} required htmlFor="ter-name">
              <input id="ter-name" className="ctl" value={terName}
                onChange={(e) => setTerName(e.target.value)} />
            </Field>
            <Field label={t("ter.col.parent")}>
              <LinkField doctype={DT.territory} value={parent} onChange={setParent} />
            </Field>
            <Field label={t("ter.isGroup")}>
              <label className="toggle">
                <input type="checkbox" checked={isGroup === 1}
                  onChange={(e) => setIsGroup(e.target.checked ? 1 : 0)} />
                {t("ter.isGroup")}
              </label>
            </Field>
          </div>
        </Card>
      </FormLayout>
    </>
  );
}
