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
import { ErrorBox, Loading, PageHead } from "../../components/ui";
import DetailActions from "../../components/DetailActions";
import DocTabShell from "../../components/DocTabShell";

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
            doctype={DT.paymentTerms}
            name={name}
            draft
            canSubmit={false}
            canCancel={false}
            canWrite
            busy={false}
            onEdit={() => nav(`/payment-terms-templates/${encodeURIComponent(name)}/edit`)}
          />
        }
      />

      <DocTabShell doctype={DT.paymentTerms} name={name} doc={d as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
