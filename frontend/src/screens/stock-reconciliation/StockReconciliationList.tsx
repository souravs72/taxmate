import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function StockReconciliationList() {
  return (
    <DocList
      doctype={DT.stockReconciliation}
      routeBase="/stock-reconciliations"
      title={t("sr.title")}
      newLabel={t("sr.new")}
      searchPlaceholder={t("sr.search")}
      emptyLabel={t("sr.empty")}
    />
  );
}
