import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocList } from "../../lib/resource";
import { useFilteredCount, useListParams } from "../../lib/list";
import { datetime } from "../../lib/format";
import { t } from "../../i18n/strings";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, ListFooter, type Column } from "../../components/DataTable";

type Row = {
  name: string; status?: string; reference_name?: string; reference_doctype?: string;
  company?: string; modified?: string; asp_document_id?: string;
};

export default function EInvoiceLog() {
  const nav = useNavigate();
  const { page, setPage, start } = useListParams(20);
  const list = useDocList<Row>(DT.eInvoiceLog, {
    fields: ["name", "status", "reference_name", "reference_doctype", "company", "modified", "asp_document_id"],
    orderBy: { field: "modified", order: "desc" },
    limit: 20,
    limit_start: start,
  });
  const { total } = useFilteredCount(DT.eInvoiceLog, []);
  const rows = list.data ?? [];

  const columns: Column<Row>[] = [
    { key: "name", header: t("elog.col.log"), cell: (r) => r.name },
    { key: "reference_name", header: t("elog.col.invoice"), cell: (r) => r.reference_name ?? "—" },
    { key: "status", header: t("elog.col.status"), cell: (r) => <Pill cls="">{r.status}</Pill> },
    { key: "modified", header: t("elog.col.updated"), cell: (r) => datetime(r.modified) },
  ];

  return (
    <>
      <PageHead title={t("nav.eInvoiceLog")} sub={t("elog.sub")} />
      <Card>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.name}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("elog.empty")}
          onOpen={(r) => {
            if (r.reference_doctype === DT.salesInvoice && r.reference_name) {
              nav(`/invoices/${encodeURIComponent(r.reference_name)}`);
            }
          }}
        />
        <ListFooter shown={rows.length} total={total} page={page} pageSize={20} onPage={setPage} />
      </Card>
    </>
  );
}
