import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function WorkOrderList() {
  return (
    <DocList
      doctype={DT.workOrder}
      routeBase="/work-orders"
      title={t("wo.title")}
      newLabel={t("wo.new")}
      searchPlaceholder={t("wo.search")}
      emptyLabel={t("wo.empty")}
    />
  );
}
