/**
 * Mode of Payment detail — read-only view with Edit action for writers.
 * Callers: App.tsx /modes-of-payment/:name.
 * API: taxmate.api.resource.get on "Mode of Payment".
 * Schema: { name, type, enabled, accounts: [{ company, default_account }] }
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t, tStatus } from "../../i18n/strings";
import { ErrorBox, Loading, PageHead, Pill } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";

type MoPAccount = { company?: string; default_account?: string };

type Doc = {
  name: string;
  type?: string;
  enabled?: number;
  accounts?: MoPAccount[];
};

export default function ModeOfPaymentDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.modeOfPayment, name);
  const writable = canWrite(session);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/modes-of-payment")}>
            {t("mop.title")}
          </button>
        }
        title={data.name}
        actions={
          <>
            <DocHistory doctype={DT.modeOfPayment} name={name} />
            {writable ? (
            <button
              type="button"
              className="btn ghost"
              onClick={() => nav(`/modes-of-payment/${encodeURIComponent(name)}/edit`)}
            >
              {t("inv.edit")}
            </button>
          ) : null}
          </>}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          {data.enabled ? (
            <Pill cls="p-done">{t("mop.enabled")}</Pill>
          ) : (
            <Pill cls="p-cxl">{t("mop.disabled")}</Pill>
          )}
          {data.type && <Pill cls="p-flat">{tStatus(data.type)}</Pill>}
        </p>
      </PageHead>

      <DocTabShell doctype={DT.modeOfPayment} name={name} doc={data as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
