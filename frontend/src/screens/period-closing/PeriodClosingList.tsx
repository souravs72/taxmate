/**
 * PeriodClosingList — Phase 5.
 * SPA list for Period Closing Vouchers (submittable).
 * Callers: App.tsx /period-closing
 * API: taxmate.api.resource.get_list / bulk_delete on "Period Closing Voucher"
 *
 * NOTE: JE and PE are NOT VAT-period-locked — invoice-only lock.
 * Period Closing Voucher is a books administrative close unrelated to UAE VAT periods.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { useDocList } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { useDraftDelete } from "../../lib/useDraftDelete";
import { date } from "../../lib/format";
import { t } from "../../i18n/strings";
import BulkDraftBar from "../../components/BulkDraftBar";
import { Card, PageHead, Pill } from "../../components/ui";
import { DataTable, type Column } from "../../components/DataTable";

type Row = {
  name: string;
  transaction_date?: string;
  period_start_date?: string;
  period_end_date?: string;
  fiscal_year?: string;
  closing_account_head?: string;
  docstatus?: number;
};

const DOCTYPE = "Period Closing Voucher";

export default function PeriodClosingList() {
  const nav = useNavigate();
  const session = useSession();
  const company = session.company || "";

  const list = useDocList<Row>(DOCTYPE, {
    // net_total_profit is not a parent field on Period Closing Voucher.
    fields: [
      "name",
      "transaction_date",
      "period_start_date",
      "period_end_date",
      "fiscal_year",
      "closing_account_head",
      "docstatus",
    ],
    filters: company ? [["company", "=", company]] : [],
    orderBy: { field: "transaction_date", order: "desc" },
    limit: 50,
  });
  const rows = list.data ?? [];

  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DOCTYPE,
    onDone: refreshList,
    enabled: writable,
    mode: "draft",
    clearDeps: [company],
  });

  const columns: Column<Row>[] = [
    { key: "name", header: t("pcv.col.name"), cell: (r) => <span className="ordno">{r.name}</span> },
    { key: "date", header: t("pcv.col.date"), className: "dt", cell: (r) => date(r.transaction_date) },
    {
      key: "period",
      header: t("pcv.col.period"),
      cell: (r) =>
        r.period_start_date && r.period_end_date
          ? `${date(r.period_start_date)} – ${date(r.period_end_date)}`
          : r.fiscal_year || "—",
    },
    { key: "account", header: t("pcv.col.account"), cell: (r) => r.closing_account_head || "—" },
    {
      key: "status",
      header: t("inv.col.status"),
      role: "status",
      cell: (r) => (
        <Pill cls={r.docstatus === 1 ? "p-sub" : r.docstatus === 2 ? "p-cancel" : "p-draft"}>
          {r.docstatus === 1
            ? t("status.Submitted")
            : r.docstatus === 2
              ? t("status.Cancelled")
              : t("status.Draft")}
        </Pill>
      ),
    },
  ];

  return (
    <>
      <PageHead title={t("pcv.title")} />
      <Card bodyClass={null as unknown as string}>
        <BulkDraftBar drafts={draftDelete} />
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/period-closing/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("pcv.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />
      </Card>
    </>
  );
}
