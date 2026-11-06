import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function CustomerList() {
  return (
    <DocList
      doctype={DT.customer}
      routeBase="/customers"
      title={t("cust.title")}
      newLabel={t("cust.new")}
      searchPlaceholder={t("cust.search")}
      emptyLabel={t("cust.empty")}
    />
  );
}
