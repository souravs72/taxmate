import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PricingRuleList() {
  return (
    <DocList
      doctype={DT.pricingRule}
      routeBase="/pricing-rules"
      title={t("prule.title")}
      newLabel={t("prule.new")}
      searchPlaceholder={t("prule.search")}
      emptyLabel={t("prule.empty")}
    />
  );
}
