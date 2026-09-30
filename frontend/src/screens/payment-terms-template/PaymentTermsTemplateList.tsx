/**
 * Payment Terms Template list.
 * Callers: App.tsx /payment-terms-templates
 * API: taxmate.api.resource.get_list / bulk_delete on "Payment Terms Template"
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

type Row = { name: string; template_name?: string };

export default function PaymentTermsTemplateList() {
  const nav = useNavigate();
  const session = useSession();
  const list = useDocList<Row>(DT.paymentTerms, {
    fields: ["name", "template_name"],
    orderBy: { field: "modified", order: "desc" },
    limit: 100,
  });
  const rows = list.data ?? [];
  const writable = canWrite(session);
  const refreshList = useCallback(() => { void list.mutate(); }, [list]);
  const draftDelete = useDraftDelete({
    doctype: DT.paymentTerms,
    onDone: refreshList,
    enabled: writable,
    mode: "all",
  });

  const columns: Column<Row>[] = [
    { key: "name", header: t("ptt.col.name"), cell: (r) => r.template_name || r.name },
  ];

  return (
    <>
      <PageHead
        title={t("ptt.title")}
        actions={
          <IfCanWrite>
            <button type="button" className="btn" onClick={() => nav("/payment-terms-templates/new")}>
              {t("ptt.new")}
            </button>
          </IfCanWrite>
        }
      />
      <Card bodyClass={null as unknown as string}>
        <BulkDraftBar drafts={draftDelete} />
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.name}
          onOpen={(r) => nav(`/payment-terms-templates/${encodeURIComponent(r.name)}`)}
          state={{ isLoading: list.isLoading, error: list.error, onRetry: () => list.mutate() }}
          emptyLabel={t("ptt.empty")}
          columns={columns}
          selection={draftDelete.selection(rows)}
        />
      </Card>
    </>
  );
}
