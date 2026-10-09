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
import DocHistory from "../../components/DocHistory";
import LineItems, { type LineField } from "../../components/LineItems";

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
        actions={<>
            <DocHistory doctype={DT.bom} name={name} />
            {writable ? (
          <button type="button" className="btn ghost" onClick={() => nav(`/boms/${encodeURIComponent(name)}/edit`)}>{t("edit")}</button>
        ) : null}
          </>}
      >
        <p className="sub" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
          {data.is_active ? <Pill cls="p-done">{t("bom.activeLabel")}</Pill> : <Pill cls="p-flat">{t("no")}</Pill>}
        </p>
      </PageHead>
      <Card>
        <div className="fg">
          <ReadRow k={t("bom.col.item")} v={data.item_name || data.item || "—"} />
          <ReadRow k={t("bom.col.qty")} v={String(data.quantity ?? "—")} />
          {data.is_default ? <ReadRow k={t("bom.col.default")} v={t("yes")} /> : null}
        </div>
      </Card>
      <Card title={t("bom.materials")}>
        {/* Read-only: the BOM's materials cannot be added or removed here, so
            no add or remove, and nothing hides behind "More" on a phone. */}
        <LineItems<BomItem>
          rows={data.items ?? []}
          collapse={false}
          fields={[
            {
              key: "material", label: t("bom.col.material"), slot: "title",
              render: (r) => <>{r.item_name || r.item_code || "—"}</>,
            },
            {
              key: "qty", label: t("bom.col.matQty"), slot: "primary", numeric: true,
              render: (r) => <>{r.qty}</>,
            },
            {
              key: "uom", label: t("bom.col.uom"),
              render: (r) => <>{r.uom || "—"}</>,
            },
          ] as LineField<BomItem>[]}
        />
      </Card>
    </>
  );
}
