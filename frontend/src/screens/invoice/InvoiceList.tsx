import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

/** Desk-like Sales Invoice list — no custom KPI tiles. */
export default function InvoiceList() {
  return (
    <DocList
      doctype={DT.salesInvoice}
      routeBase="/invoices"
      title={t("inv.title")}
      newLabel={t("inv.new")}
      searchPlaceholder={t("inv.search")}
      emptyLabel={t("inv.empty")}
    />
  );
}
