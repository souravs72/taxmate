import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function PosInvoiceList() {
  return (
    <DocList
      doctype={DT.posInvoice}
      routeBase="/pos-invoices"
      title={t("pos.title")}
      newLabel={t("pos.new")}
      searchPlaceholder={t("pos.search")}
      emptyLabel={t("pos.empty")}
    />
  );
}
