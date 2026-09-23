import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type Doc = {
  name: string;
  warehouse_name?: string;
  warehouse_type?: string;
  company?: string;
  parent_warehouse?: string;
  is_group?: number;
  disabled?: number;
  account?: string;
};

export default function WarehouseDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.warehouse, name);
  const writable = canWrite(session);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/warehouses")}>{t("nav.warehouses")}</button>}
        title={data.warehouse_name || data.name}
        actions={
          writable ? (
            <button type="button" className="btn ghost"
              onClick={() => nav(`/warehouses/${encodeURIComponent(name)}/edit`)}>
              {t("inv.edit")}
            </button>
          ) : undefined
        }
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          <span className="ordno">{data.name}</span>
          <Pill cls={data.is_group ? "p-flat" : "p-done"}>{data.is_group ? t("wh.group") : t("wh.leaf")}</Pill>
          {data.disabled ? <Pill cls="p-cxl">{t("coa.disabled")}</Pill> : <Pill cls="p-done">{t("wh.active")}</Pill>}
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("coa.company")} v={data.company || "—"} />
          <ReadRow k={t("wh.col.type")} v={data.warehouse_type || "—"} />
          <ReadRow k={t("wh.col.parent")} v={data.parent_warehouse || "—"} />
          <ReadRow k={t("wh.account")} v={data.account || "—"} />
        </div>
      </Card>
    </>
  );
}
