import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { DT } from "../../lib/frappe";
import { useDocCount, useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { useListParams, type FilterTuple } from "../../lib/list";
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
  const session = useSession();
  const { page, setPage, start } = useListParams(20);
  const company = session.company;
  const paused = !session.user || !company;
  const filters = useMemo<FilterTuple[]>(
    () => (company ? [["company", "=", company]] : []),
    [company],
  );
  const list = useDocList<Row>(DT.eInvoiceLog, {
    fields: ["name", "status", "reference_name", "reference_doctype", "company", "modified", "asp_document_id"],
    filters,
    orderBy: { field: "modified", order: "desc" },
    limit: 20,
    limit_start: start,
  }, paused ? null : undefined);
  const count = useDocCount(DT.eInvoiceLog, filters, undefined, paused ? null : undefined);
  const rows = list.data ?? [];
  const total = count.data ?? 0;

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
          state={{ isLoading: paused || list.isLoading, error: list.error, onRetry: () => list.mutate() }}
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
