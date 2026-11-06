import DocList from "../../components/DocList";
import { DT } from "../../lib/frappe";
import { t } from "../../i18n/strings";

export default function ItemGroupList() {
  return (
    <DocList
      doctype={DT.itemGroup}
      routeBase="/catalogue/item-groups"
      title={t("ig.title")}
      newLabel={t("ig.new")}
      searchPlaceholder={t("ig.search")}
      emptyLabel={t("ig.empty")}
    />
  );
}
