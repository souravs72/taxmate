import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function StockEntryList() {
  return (
    <DocList
      doctype={DT.stockEntry}
      routeBase="/stock-entries"
      title={t("se.title")}
      newLabel={t("se.new")}
      searchPlaceholder={t("se.search")}
      emptyLabel={t("se.empty")}
    />
  );
}
