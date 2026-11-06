import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PurchaseOrderList() {
  return (
    <DocList
      doctype={DT.purchaseOrder}
      routeBase="/purchase-orders"
      title={t("po.title")}
      newLabel={t("po.new")}
      searchPlaceholder={t("po.search")}
      emptyLabel={t("po.empty")}
    />
  );
}
