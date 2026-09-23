/**
 * BomDetail — Phase 18. BOM read-only detail.
 * Callers: App.tsx /boms/:name
 */
import { useNavigate, useParams } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead, Pill, ReadRow } from "../../components/ui";

type BomItem = { item_code?: string; item_name?: string; qty?: number; uom?: string; rate?: number; amount?: number };
type Doc = { name: string; item?: string; item_name?: string; quantity?: number; is_active?: number; is_default?: number; items?: BomItem[] };

export default function BomDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const writable = canWrite(session);
  const { data, error, isLoading, mutate } = useDoc<Doc>(DT.bom, name);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={() => mutate()} />;
  if (!data) return null;

  return (
    <>
      <PageHead
        eyebrow={<button type="button" className="btn quiet" onClick={() => nav("/boms")}>{t("bom.title")}</button>}
        title={data.name}
      >
        {data.is_active ? <Pill cls="p-done">{t("bom.activeLabel")}</Pill> : <Pill cls="p-flat">{t("no")}</Pill>}
        {writable && (
          <button className="btn ghost" onClick={() => nav(`/boms/${encodeURIComponent(name)}/edit`)}>{t("edit")}</button>
        )}
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("bom.col.item")} v={data.item_name || data.item || "—"} />
          <ReadRow k={t("bom.col.qty")} v={String(data.quantity ?? "—")} />
          {data.is_default ? <ReadRow k={t("bom.col.default")} v={t("yes")} /> : null}
        </div>
      </Card>
      <Card title={t("bom.materials")}>
        <div className="twrap">
          <table>
            <thead><tr>
              <th>{t("bom.col.material")}</th>
              <th className="n">{t("bom.col.matQty")}</th>
              <th>{t("bom.col.uom")}</th>
            </tr></thead>
            <tbody>
              {(data.items ?? []).map((r, i) => (
                <tr key={i}>
                  <td>{r.item_name || r.item_code || "—"}</td>
                  <td className="n">{r.qty}</td>
                  <td>{r.uom || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
