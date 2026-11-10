/**
 * Pricing Rule detail. Route: /pricing-rules/:name
 * API: useDoc on "Pricing Rule". Callers: App.tsx. Phase 9.
 */
import { useParams, useNavigate, Link } from "react-router-dom";
import { DT } from "../../lib/frappe";
import { useDoc } from "../../lib/resource";
import { useSession } from "../../lib/session";
import { canWrite } from "../../lib/roles";
import { t } from "../../i18n/strings";
import { Loading, ErrorBox, PageHead } from "../../components/ui";
import DocHistory from "../../components/DocHistory";
import DocTabShell from "../../components/DocTabShell";

type Doc = {
  title?: string;
  apply_on?: string;
  customer?: string;
  min_qty?: number;
  rate_or_discount?: string;
  discount_percentage?: number;
  discount_amount?: number;
  rate?: number;
  valid_from?: string;
  valid_upto?: string;
  priority?: number;
  disable?: number;
  company?: string;
  items?: { item_code?: string }[];
  item_groups?: { item_group?: string }[];
  brands?: { brand?: string }[];
};

export default function PricingRuleDetail() {
  const { name = "" } = useParams();
  const nav = useNavigate();
  const session = useSession();
  const doc = useDoc<Doc>(DT.pricingRule, name, name);

  if (doc.isLoading) return <Loading />;
  if (doc.error) return <ErrorBox error={doc.error} onRetry={() => doc.mutate()} />;
  const d = doc.data ?? {};

  return (
    <>
      <PageHead
        title={name}
        eyebrow={<Link to="/pricing-rules">{t("prule.title")}</Link>}
        actions={
          <>
            <DocHistory doctype={DT.pricingRule} name={name} />
            {canWrite(session) ? (
              <button type="button" className="btn" onClick={() => nav(`/pricing-rules/${encodeURIComponent(name)}/edit`)}>
                {t("form.edit")}
              </button>
            ) : null}
          </>
        }
      />

      <DocTabShell doctype={DT.pricingRule} name={name} doc={d as unknown as Record<string, unknown>}>
      </DocTabShell>
    </>
  );
}
