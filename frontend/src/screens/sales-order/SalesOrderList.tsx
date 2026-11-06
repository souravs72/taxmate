import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function SalesOrderList() {
  return (
    <DocList
      doctype={DT.salesOrder}
      routeBase="/orders"
      title={t("so.title")}
      newLabel={t("so.new")}
      emptyLabel={t("list.empty")}
    />
  );
}
