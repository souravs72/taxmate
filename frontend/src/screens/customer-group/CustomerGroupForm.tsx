/**
 * Customer Group form. Routes: /customer-groups/new, /:name/edit
 * API: insert/save on "Customer Group". Desk layout via form_layout.get.
 */
import { useNavigate, useParams, Navigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDeskForm } from "../../lib/deskForm";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DocTabShell from "../../components/DocTabShell";

export default function CustomerGroupForm() {
  const { name = "new" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { isNew, existing, values, setField, save, busy, saveError } = useDeskForm(DT.customerGroup, name);
  const ready = !!String(values.customer_group_name || "").trim();

  async function onSave() {
    try {
      const doc = await save();
      nav(`/customer-groups/${encodeURIComponent(String(doc.name))}`);
    } catch { /* saveError */ }
  }

  if (!isNew && existing.isLoading) return <Loading />;
  if (!isNew && existing.error) return <ErrorBox error={existing.error} onRetry={() => existing.mutate()} />;
  if (!canWrite(session)) return <Navigate to="/customer-groups" replace />;

  return (
    <>
      <PageHead
        title={isNew ? t("cg.new") : name}
        actions={
          <>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => nav(-1)}>{t("form.cancel")}</button>
            <button type="button" className="btn" disabled={busy || !ready} onClick={() => void onSave()}>{t("form.save")}</button>
          </>
        }
      />

      <DocTabShell doctype={DT.customerGroup} name={isNew ? "" : name} doc={values} onChange={setField}>
        {saveError ? <ErrorBox error={saveError} /> : null}
      </DocTabShell>
    </>
  );
}
