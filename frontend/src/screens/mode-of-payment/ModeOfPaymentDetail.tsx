/**
 * Mode of Payment detail — read-only view with Edit action for writers.
 * Callers: App.tsx /modes-of-payment/:name.
 * API: taxmate.api.resource.get on "Mode of Payment".
 * Schema: { name, type, enabled }
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string;
  type?: string;
  enabled?: number;
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
          writable ? (
            <button type="button" className="btn ghost"
              onClick={() => nav(`/modes-of-payment/${encodeURIComponent(name)}/edit`)}>
              {t("inv.edit")}
            </button>
          ) : undefined
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          {data.enabled
            ? <Pill cls="p-done">{t("mop.enabled")}</Pill>
            : <Pill cls="p-cxl">{t("mop.disabled")}</Pill>}
          {data.type && <Pill cls="p-flat">{data.type}</Pill>}
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("mop.col.type")} v={data.type || "—"} />
          <ReadRow k={t("mop.col.enabled")} v={data.enabled ? t("yes") : t("no")} />
        </div>
      </Card>
    </>
  );
}
