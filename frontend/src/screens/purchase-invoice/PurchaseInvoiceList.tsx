import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PurchaseInvoiceList() {
  return (
    <DocList
      doctype={DT.purchaseInvoice}
      routeBase="/purchase-invoices"
      title={t("pi.title")}
      newLabel={t("pi.new")}
      searchPlaceholder={t("pi.search")}
      emptyLabel={t("pi.empty")}
    />
  );
}
