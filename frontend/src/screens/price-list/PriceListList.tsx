/**
 * Price List list screen.
 * Callers: App.tsx /price-lists
 * API: taxmate.api.resource.get_list / bulk_delete on "Price List"
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDraftDelete } from "../../lib/useDraftDelete";
import BulkDraftBar from "../../components/BulkDraftBar";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useDocList } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, PageHead } from "../../components/ui";
import { DataTable, type Column } from "../../components/DataTable";
import { IfCanWrite } from "../../components/RoleGate";

type Row = { name: string; currency?: string; selling?: number; buying?: number; enabled?: number };

export default function PriceListList() {
  const nav = useNavigate();
  const session = useSession();
  const list = useDocList<Row>(DT.priceList, {
    fields: ["name", "currency", "selling", "buying", "enabled"],
    orderBy: { field: "modified", order: "desc" },
    limit: 100,
  });
  const rows = list.data ?? [];
  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.priceList,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
  });

  const columns: Column<Row>[] = [
    { key: "name", header: t("pl.col.name"), cell: (r) => r.name },
    { key: "currency", header: t("pl.col.currency"), cell: (r) => r.currency || "—" },
    { key: "selling", header: t("pl.col.selling"), cell: (r) => (r.selling ? t("yes") : t("no")) },
    { key: "buying", header: t("pl.col.buying"), cell: (r) => (r.buying ? t("yes") : t("no")) },
    { key: "enabled", header: t("pl.col.enabled"), cell: (r) => (r.enabled ? t("yes") : t("no")) },
  ];

  return (
    <>
      <PageHead
        title={t("pl.title")}
        actions={
          <IfCanWrite>
            <button type="button" className="btn" onClick={() => nav("/price-lists/new")}>
              {t("pl.new")}
            </button>
          </IfCanWrite>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <BulkDraftBar drafts={draftDelete} />
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/price-lists/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("pl.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />
      </Card>
    </>
  );
}
