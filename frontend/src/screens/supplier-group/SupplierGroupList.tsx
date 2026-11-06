import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function SupplierGroupList() {
  return (
    <DocList
      doctype={DT.supplierGroup}
      routeBase="/supplier-groups"
      title={t("sg.title")}
      newLabel={t("sg.new")}
      searchPlaceholder={t("sg.search")}
      emptyLabel={t("sg.empty")}
    />
  );
}
