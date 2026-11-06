import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function IncomingInvoiceList() {
  return (
    <DocList
      doctype={DT.incomingInvoice}
      routeBase="/incoming-invoices"
      title={t("in.title")}
      searchPlaceholder={t("in.search")}
      emptyLabel={t("in.empty")}
    />
  );
}
