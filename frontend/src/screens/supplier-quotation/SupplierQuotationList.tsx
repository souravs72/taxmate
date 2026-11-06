import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function SupplierQuotationList() {
  return (
    <DocList
      doctype={DT.supplierQuotation}
      routeBase="/supplier-quotations"
      title={t("sq.title")}
      newLabel={t("sq.new")}
      searchPlaceholder={t("sq.search")}
      emptyLabel={t("sq.empty")}
    />
  );
}
