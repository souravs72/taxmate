/**
 * Payment Terms Template detail view.
 * Callers: App.tsx /payment-terms-templates/:name
 * API: taxmate.api.resource.get on "Payment Terms Template"
 * ERPNext computes due_date on submit — SPA shows template rows read-only.
 */
import { useNavigate, useParams } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { t } from "../../i18n/strings";
import { Card, ErrorBox, Loading, PageHead } from "../../components/ui";
import DetailActions from "../../components/DetailActions";

type TermRow = {
  payment_term?: string;
  due_date_based_on?: string;
  invoice_portion?: number;
  credit_days?: number;
  credit_months?: number;
  description?: string;
};

type Doc = {
  name: string;
  template_name?: string;
  terms?: TermRow[];
};

export default function PaymentTermsTemplateDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const doc = useDoc<Doc>(DT.paymentTerms, name, name);

  if (doc.isLoading) return <Loading />;
  if (doc.error) return <ErrorBox error={doc.error} onRetry={() => doc.mutate()} />;
  const d = doc.data;
  if (!d) return null;

  return (
    <>
      <PageHead
        eyebrow={
          <button type="button" className="btn quiet" onClick={() => nav("/payment-terms-templates")}>
            {t("ptt.title")}
          </button>
        }
        title={d.template_name || d.name}
        actions={
          <DetailActions
            draft
            canSubmit={false}
            canCancel={false}
            canWrite
            busy={false}
            onEdit={() => nav(`/payment-terms-templates/${encodeURIComponent(name)}/edit`)}
          />
        }
      />
      <Card title={t("ptt.terms")}>
        {(d.terms ?? []).length === 0 ? (
          <p style={{ color: "var(--faint)" }}>{t("ptt.noTerms")}</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("ptt.term.name")}</th>
                <th>{t("ptt.term.basis")}</th>
                <th>{t("ptt.term.portion")}</th>
                <th>{t("ptt.term.days")}</th>
                <th>{t("ptt.term.months")}</th>
              </tr>
            </thead>
            <tbody>
              {(d.terms ?? []).map((r, i) => (
                <tr key={i}>
                  <td>{r.payment_term || "—"}</td>
                  <td>{r.due_date_based_on || "—"}</td>
                  <td>{r.invoice_portion ?? "—"}</td>
                  <td>{r.credit_days ?? "—"}</td>
                  <td>{r.credit_months ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
