/**
 * UaeCapitalGoodsList — Phase 22. List UAE Capital Goods Adjustments.
 * Callers: App.tsx /uae-capital-goods-adjustments
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { t } from "../../i18n/strings";
import { money } from "../../lib/format";
import { Card, Loading, PageHead } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";
import { FilterBar } from "../../components/filters";
import { IfCanWrite } from "../../components/RoleGate";

const PAGE = 30;
type Row = { name: string; company?: string; period_start?: string; period_end?: string; adjustment_vat?: number };

export default function UaeCapitalGoodsList() {
  const nav = useNavigate();
  const { page, setPage, start } = useListParams(PAGE);

  const list = useDocList<Row>(DT.uaeCapitalGoods, {
    fields: ["name", "company", "period_start", "period_end", "adjustment_vat"],
    filters: [] as never,
    orderBy: { field: "period_start", order: "desc" },
    limit: PAGE, limit_start: start,
  });
  const count = useDocCount(DT.uaeCapitalGoods, [] as never);

  const columns: Column<Row>[] = [
    { key: "period", header: t("ucg.col.period"), cell: (r) => `${r.period_start ?? ""} – ${r.period_end ?? ""}` },
    { key: "adjustment_vat", header: t("ucg.col.vatAdj"), className: "n", cell: (r) => money(r.adjustment_vat) },
  ];

  return (
    <>
      <PageHead title={t("ucg.title")}>
        <IfCanWrite>
          <button className="btn" onClick={() => nav("/uae-capital-goods-adjustments/new")}>{t("ucg.new")}</button>
        </IfCanWrite>
      </PageHead>
      <Card bodyClass={null as unknown as string}>
        <FilterBar>{null}</FilterBar>
        {list.isLoading ? <Loading /> : (
          <DataTable<Row>
            rows={list.data ?? []}
            rowKey={(r) => r.name}
            onOpen={(r) => nav(`/uae-capital-goods-adjustments/${encodeURIComponent(r.name)}`)}
            columns={columns}
            emptyLabel={t("ucg.empty")}
          />
        )}
        <ListFooter shown={(list.data ?? []).length} total={count.data ?? 0} page={page} pageSize={PAGE} onPage={setPage} />
      </Card>
    </>
  );
}
