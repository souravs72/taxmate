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
import { Card, Loading, ErrorBox, PageHead } from "../../components/ui";

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
          canWrite(session) ? (
            <button type="button" className="btn" onClick={() => nav(`/pricing-rules/${encodeURIComponent(name)}/edit`)}>
              {t("form.edit")}
            </button>
          ) : null
        }
      />
      <Card num={1} title={t("prule.details")}>
        <div className="fields">
          <label>{t("prule.applyOn")}<span>{d.apply_on ?? ""}</span></label>
          {d.items?.[0]?.item_code && <label>{t("prule.itemCode")}<span>{d.items[0].item_code}</span></label>}
          {d.item_groups?.[0]?.item_group && <label>{t("prule.itemGroup")}<span>{d.item_groups[0].item_group}</span></label>}
          {d.brands?.[0]?.brand && <label>{t("prule.brand")}<span>{d.brands[0].brand}</span></label>}
          {d.customer && <label>{t("prule.customer")}<span>{d.customer}</span></label>}
          <label>{t("prule.minQty")}<span>{d.min_qty ?? 0}</span></label>
          <label>{t("prule.rateOrDiscount")}<span>{d.rate_or_discount ?? ""}</span></label>
          {d.rate_or_discount === "Discount Percentage" && (
            <label>{t("prule.discountPct")}<span>{d.discount_percentage ?? 0}%</span></label>
          )}
          {d.rate_or_discount === "Discount Amount" && (
            <label>{t("prule.discountAmt")}<span>{d.discount_amount ?? 0}</span></label>
          )}
          {d.rate_or_discount === "Rate" && (
            <label>{t("prule.rate")}<span>{d.rate ?? 0}</span></label>
          )}
          <label>{t("prule.validFrom")}<span>{d.valid_from ?? ""}</span></label>
          <label>{t("prule.validUpto")}<span>{d.valid_upto ?? ""}</span></label>
          <label>{t("prule.priority")}<span>{d.priority ?? 0}</span></label>
          <label>{t("prule.col.active")}<span>{d.disable ? t("prule.disabled") : t("prule.enabled")}</span></label>
        </div>
      </Card>
    </>
  );
}
