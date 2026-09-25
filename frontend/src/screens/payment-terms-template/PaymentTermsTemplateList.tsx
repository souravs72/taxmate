/**
 * Payment Terms Template list.
 * Callers: App.tsx /payment-terms-templates
 * API: taxmate.api.resource.get_list on "Payment Terms Template"
 */
import { useNavigate } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDocList } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Empty, ErrorBox, Loading, PageHead } from "../../components/ui";
import { IfCanWrite } from "../../components/RoleGate";

type Row = { name: string; template_name?: string };

export default function PaymentTermsTemplateList() {
  const nav = useNavigate();
  const list = useDocList<Row>(DT.paymentTerms, {
    fields: ["name", "template_name"],
    orderBy: { field: "modified", order: "desc" },
    limit: 100,
  });

  if (list.isLoading) return <Loading />;
  if (list.error) return <ErrorBox error={list.error} onRetry={() => list.mutate()} />;
  const rows = list.data ?? [];

  return (
    <>
      <PageHead
        title={t("ptt.title")}
        actions={
          <IfCanWrite>
            <button className="btn" onClick={() => nav("/payment-terms-templates/new")}>
              {t("ptt.new")}
            </button>
          </IfCanWrite>
        }
      />
      {rows.length === 0 ? (
        <Empty label={t("ptt.empty")} />
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("ptt.col.name")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} onClick={() => nav(`/payment-terms-templates/${encodeURIComponent(r.name)}`)}>
                <td>{r.template_name || r.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
