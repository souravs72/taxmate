import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function CustomerGroupList() {
  return (
    <DocList
      doctype={DT.customerGroup}
      routeBase="/customer-groups"
      title={t("cg.title")}
      newLabel={t("cg.new")}
      searchPlaceholder={t("cg.search")}
      emptyLabel={t("cg.empty")}
    />
  );
}
