/**
 * FiscalYearList — Phase 13.
 * Callers: App.tsx /fiscal-years; nav.ts nav.fiscalYears
 * API: taxmate.api.resource.get_list on "Fiscal Year" (_CORE_MASTERS)
 * Schema: {name, year_start_date:"YYYY-MM-DD", year_end_date:"YYYY-MM-DD", is_short_year:0|1}
 */
import { useNavigate } from "react-router-dom";

import { useDocList } from "../../lib/resource";
import { useListParams } from "../../lib/list";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";

const PAGE = 20;
type Row = {
  name: string;
  year_start_date?: string;
  year_end_date?: string;
  is_short_year?: number;
};

export default function FiscalYearList() {
  const nav = useNavigate();
  const { page, setPage, start } = useListParams(PAGE);

  const list = useDocList<Row>("Fiscal Year", {
    fields: ["name", "year_start_date", "year_end_date", "is_short_year"],
    orderBy: { field: "year_start_date", order: "desc" },
    limit: PAGE,
    limit_start: start,
  });

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: t("fy.col.name"),
      cell: (r) => <span className="ordno">{r.name}</span>,
    },
    { key: "start", header: t("fy.col.start"), cell: (r) => date(r.year_start_date) },
    { key: "end", header: t("fy.col.end"), cell: (r) => date(r.year_end_date) },
    {
      key: "short",
      header: t("fy.col.short"),
      cell: (r) => (r.is_short_year ? <Pill cls="p-flat">{t("yes")}</Pill> : null),
    },
  ];

  return (
    <>
      <PageHead title={t("fy.title")} />
      <Card bodyClass={null as unknown as string}>
        <DataTable<Row>
          rows={list.data ?? []}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/fiscal-years/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("fy.empty")}
          columns={columns}
        />
        <ListFooter
          shown={(list.data ?? []).length}
          total={(list.data ?? []).length}
          page={page}
          pageSize={PAGE}
          onPage={setPage}
        />
      </Card>
    </>
  );
}
