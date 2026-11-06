import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function SupplierList() {
  return (
    <DocList
      doctype={DT.supplier}
      routeBase="/suppliers"
      title={t("supp.title")}
      newLabel={t("supp.new")}
      searchPlaceholder={t("supp.search")}
      emptyLabel={t("supp.empty")}
    />
  );
}
