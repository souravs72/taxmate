import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PurchaseReceiptList() {
  return (
    <DocList
      doctype={DT.purchaseReceipt}
      routeBase="/purchase-receipts"
      title={t("pr.title")}
      newLabel={t("pr.new")}
      searchPlaceholder={t("pr.search")}
      emptyLabel={t("pr.empty")}
    />
  );
}
